/**
 * Given a FamilySearch-style GEDCOM X object
 * as returned by JSON.parse(gedcomx.json),
 * returns a GEDCOM 7.0 string.
 * 
 * This function is built in a fairly ad-hoc manner, looking through a few
 * example files provided via the FamilySearch Family Tree API and periodically
 * consulting the gedcomx specification
 * <https://github.com/FamilySearch/gedcomx/tree/master/specifications>
 * and FamilySearch API documentation
 * <https://www.familysearch.org/developers/docs/api/media-types>.
 * I did periodically look at the GEDCOM 7 specification
 * <https://gedcom.io/specifications/FamilySearchGEDCOMv7.html>
 * but not very often; it passes validators for me on examples so far,
 * but may be able to emit non-conformant files in principle
 * such as a relocated standard structure not using an extension tag
 * or structures missing required substructures.
 * 
 * @param {object} gx - the a GEDOMX dataset parsed from JSON format
 * @param {function} error - a vararg function accepting error messages; for example, `console.error`
 * @returns {string} a corresponding GEDCOM 7.0 dataset
 */
function GEDCOMXTo7(gx, error) {
  
  if (!error) error = (...args) => {}
  const xlinks = {}
  const xlinkMaker = e => {
    if ('object' != typeof(e)) return
    if (Array.isArray(e)) e.forEach(xlinkMaker)
    else {
      if ('id' in e) xlinks['#'+e.id] = e
      Object.values(e).forEach(xlinkMaker)
    }
  }
  xlinkMaker(gx)
  
  function g7s(tag, payload, ...substructures) {
    if (!new.target) return new g7s(tag, payload, ...substructures)
    this.tag = tag
    this.id = null
    this.payload = payload
    if (payload && 'object' == typeof payload) {
      this.payload = payload
      if (!payload.id) this.payload.id = 'X'+(g7s.nextXrefID += 1)
    } else if (payload) this.payload = String(payload).replace(/\r\n?/g, '\n')
    else this.payload = null
    this.subs = substructures.filter(x=>x)
  }
  g7s.nextXrefID = 0
  g7s.prototype.toString = function(level) {
    level = level || 0
    let self = level + (this.id ? ' @'+this.id+'@':'') + ' '+this.tag
    if (this.payload && 'object' == typeof this.payload) {
      self += ' @'+this.payload.id+'@'
    } else if (this.payload == '@VOID@') {
      self += ' @VOID@'
    } else if (this.payload) {
      let txt = this.payload.replace(/\n(@?)/g, `\n${level+1} CONT $1$1`).replace(/^([0-9]+ CONT) $/mg, "$1")
      if (txt[0] == '@') self += ' @'+txt
      else if (txt[0] == '\n') self += txt
      else self += ' '+txt
    }
    return self+'\n'+this.subs.map(s => s.toString(level+1)).join('')
  }
  g7s.prototype.add = function(...subs) { this.subs.push(...subs.filter(x=>x)) }
  
  const parseDataURL = uri => {
    // fetch(uri).then(r=>r.text()).then(...)
    let [_, mt, b, d] = /data:([^;,]+)?(;base64)?,([\s\S]*)/.exec(uri)
    d = decodeURI(d)
    if (b == ';base64') d = atob(d)
    return d
  }
  
  
  let records = {}
  let header = g7s('HEAD', null, g7s('GEDC',null, g7s('VERS','7.0')))
  let extensions = []
  let trailer = g7s('TRLR')
  
  let frag = {}
  Object.values(gx).forEach(v => {if (Array.isArray(v)) v.forEach(o => {if (o.id) frag[o.id] = o})})

  const simple = /^(A)?([-+][0-9]{4})(?:-([0-9]{2})(?:-([0-9]{2})(?:T([0-9]{2})(?::([0-9]{2})(?::([0-9]{2}(?:.[0-9]{3})))?)?([-+][0-9]{2}(?::[0-9]{2})?|Z)?)?)?)?$/
  const duration = /^P(?:([0-9]+)Y)?(?:([0-9]+)M)?(?:([0-9]+)D)?(?:T(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)S)?)?$/
  const months = {'01':'JAN','02':'FEB','03':'MAR','04':'APR','05':'MAY','06':'JUN','07':'JUL','08':'AUG','09':'SEP','10':'OCT','11':'NOV','12':'DEC'}
  const oneDate = d => {
    let [_,a,Y,M,D,h,m,s,z] = simple.exec(d)
    if (D && D.length == 2 && D[0] == '0') D = D[1]
    Y = Number(Y)
    let epoch = ''
    if (Y <= 0) { Y = 1-Y; epoch = ' BCE' }
    let date = (a?'ABT ':'')+(D?D+' ':'')+(M?months[M]+' ':'')+Y+epoch
    if (!h) return [date,false,false]
    let time = h+':'+(m?m:'00')+(s?':'+s:'')
    if (z == 'Z') return [date, time+'Z', false]
    else return [date, time, 'Time zone '+z]
  }
  
  const doDate = (d, period) => {
    if (typeof(d) == 'number') d = '+'+(new Date(d).toJSON()).replace('+-00','-')
    if (typeof(d) == 'object') {
      if ('formal' in d) {
        let ans = doDate(d.formal)
        if (ans.subs.filter(x=>x.tag == 'PHRASE').length > 0) {
          ans.subs.filter(x=>x.tag == 'PHRASE')[0].payload = d.original
        } else {
          if ('original' in d) ans.add(g7s('PHRASE', d.original))
        }
        return ans
      }
      if ('original' in d) {
        return g7s('DATE', null, g7s('PHRASE', d.original))
      } else return null
    }
    let bits = d.split('/')
    let phrases = []
    if (bits.length > 3) return g7s('DATE',null,g7s('PHRASE','unsupported gedcomx data: '+d))
    if (bits.length == 3) {
      // recurring
      let times = bits[0].substr(1)
      if (times.length == 0) times = 'indefinitely'
      else if (times == '1') times = 'once'
      else times += ' times'
      if (bits[2][0] == 'P') {
        let [_, Y, M, D, h, m, s]  = duration.exec(bits[2])
        phrases.push(`repeats ${times} every ${Y?Y+' years ':''}${M?M+' months ':''}${D?D+' days ':''}${h?h+' hours ':''}${m?m+' minutes ':''}${s?s+' seconds ':''}`.trim())
      } else {
        let a = simple.exec(bits[1]).slice(1,7).map(_ => _?Number(_):0)
        let b = simple.exec(bits[2]).slice(1,7).map(_ => _?Number(_):0)
        let [Y,M,D,h,m,s] = a.map((v,i) => b[i]-v)
        phrases.push(`repeats ${times} every ${Y?Y+' years ':''}${M?M+' months ':''}${D?D+' days ':''}${h?h+' hours ':''}${m?m+' minutes ':''}${s?s+' seconds ':''}`.trim())
      }
      bits = [bits[1]]
    } // no else: fall through to length 1
    if (bits.length == 2) {
      if (bits[0].length > 0 && bits[0][0] == 'A') {
        phrases.push('gedcomx date: '+d)
        bits[0] = bits[0].substr(1)
      }
      let sd = bits[0].length > 0 ? oneDate(bits[0]) : false
      let ed = bits[1].length > 0 ? oneDate(bits[1]) : false
      if (sd?.[2] && ed?.[2]) phrases.push('Starting in '+sd[2]+'; ending in '+ed[2])
      else if (sd?.[2] || ed?.[2]) phrases.push(sd?.[2] || ed?.[2])
      if (sd?.[1] || ed?.[1]) phrases.push('gedcomx date: '+d)
      let phrase = phrases.length > 0 ? g7s('PHRASE', phrases.join('\n')) : null
      if (period) {
        if (sd && ed) return g7s('DATE',`FROM ${sd[0]} TO ${ed[0]}`, phrase)
        else if (sd)  return g7s('DATE',`FROM ${sd[0]}`, phrase)
        else if (ed)  return g7s('DATE',`TO ${ed[0]}`, phrase)
        else return g7s('DATE',null,g7s('PHRASE','gedcomx date: '+d))
      } else {
        if (sd && ed) return g7s('DATE',`BET ${sd[0]} AND ${ed[0]}`, phrase)
        else if (sd)  return g7s('DATE',`AFT ${sd[0]}`, phrase)
        else if (ed)  return g7s('DATE',`BEF ${ed[0]}`, phrase)
        else return g7s('DATE',null,g7s('PHRASE','gedcomx date: '+d))
      }
    } else { // bits.length == 1
      let od = oneDate(bits[0])
      if (od[2]) phrases.push(od[2])
      let phrase = phrases.length > 0 ? g7s('PHRASE', phrases.join('\n')) : null
      let time = od[1] ? g7s('TIME', od[1]) : null
      
      return g7s('DATE', od[0], time, phrase)
    }
  }

  
  const doSource = s => {
    if (records[s.id]) return records[s.id]
    let ans = g7s('SOUR')
    if (s.id) ans.add(g7s('UID',s.id))
    if (s.descriptionId) ans.add(g7s('EXID',s.descriptionId,g7s('TYPE','https://gedcom.io/exid-type/FamilySearch-SourceDescriptionId')))
    return records[s.id] = ans
  }
  const doNote = note => {
    let ans = g7s('NOTE', note.text)
    if ('lang' in note) ans.add(g7s('LANG',note.lang))
    if ('subject' in note) ans.payload = note.subject+':\n\n'+ans.payload
    // to do: handle attribution (perhaps via change log or signature?)
    return ans
  }
  const doPlace = place => {
    let exid = null, kml = null, map = null
    let ptr = xlinks[place.description]
    let orig = place.original
    let pay = {'':[]}
    let form = []
    let ans = null
    while(ptr) {
      pay[''].push(ptr.names[0].value)
      ptr.names.forEach(tv => {
        let lang = tv.lang || 'und'
        if (!(lang in pay)) pay[lang] = []
        while(pay[lang].length+1 < pay[''].length) pay[lang].push('')
        if (pay[lang].length < pay[''].length) pay[lang].push(tv.value)
      })
      if (form && ptr.type) form.push(ptr.type)
      else form = false
      if (!exid && ptr.place) exid = ptr.place
      if (!kml && ptr.spatialDescription) kml = ptr.spatialDescription
      if (!map && ptr.latitude && ptr.longitude) map = ptr
      ptr = xlinks[ptr.description]
    }
    if (pay[''].length > 0) {
      // can we find language of preferred form?
      let lang = '';
      Object.entries(pay).forEach(([l,v])=>{
        if (l != '' && lang == '' && v == pay[''].join(', ')) lang=l;
      })
      ans = g7s('PLAC', pay[''].join(', '))
      if (lang != '') ans.add(g7s('LANG',lang))
      if (form) ans.add(g7s('FORM', form.join(', ')))
      Object.entries(pay).forEach(([l,v])=>{
        if (l != '' && l != lang)
          ans.add(g7s('TRAN', v.join(', '), g7s('LANG', l)))
      })
      if (orig && orig != ans.payload) ans.add(g7s('NOTE',orig))
    } else {
      ans = g7s('PLAC', orig)
    }
    if (exid) {
      ans.add(g7s('EXID', exid, g7s('TYPE','http://www.w3.org/2001/XMLSchema#anyURI')))
    }
    if (kml) {
      if (!(kml in records)) {
        records[kml] = g7s('OBJE',null,g7s('FILE',kml, g7s('MEDI','application/vnd.google-earth.kml+xml')))
      }
      ans.add(g7s('_OBJE', records[kml]))
    }
    if (map) {
      ans.add(g7s('MAP',null,
        g7s('LATI',(map.latitude<0?'S':'N')+Math.abs(map.latitude)),
        g7s('LONG',(map.longitude<0?'W':'E')+Math.abs(map.longitude)),
      ))
    }
    if (place.description) { // guess; check this
      ans.add(g7s('EXID',place.description.substr(1),g7s('TYPE','https://gedcom.io/exid-type/FamilySearch-PlaceId')))
    }
    return ans
  }
  
  
  const doNameForm = (name, tag) => {
    let txt = ''
    if (name.fullText) {
      txt = name.fullText.replace(/\//g,"\uFF0F")
      if (name.parts) name.parts.forEach(p => {
        if (p.type == 'http://gedcomx.org/Surname')
          txt = txt.replace(p.value, '/'+p.value+'/')
      })
    } else {
      txt = name.parts.map(e => e.type == 'http://gedcomx.org/Surname' ? '/'+e.value+'/' : e.value).join(' ')
    }
    txt = txt.replace(/\/(\s*)\//g, '$1')
    while(txt.replace(/[^\/]+/g,'').length > 2)
      txt = txt.replace(/\//,'')
    let ans = g7s(tag, txt)
    if (name.parts) name.parts.forEach(part => {
      if (part.type == 'http://gedcomx.org/Prefix')
        ans.add(g7s('NPFX', part.value))
      else if (part.type == 'http://gedcomx.org/Suffix')
        ans.add(g7s('NSFX', part.value))
      else if (part.type == 'http://gedcomx.org/Given') {
        ans.add(g7s('GIVN', part.value))
        if (part.qualifiers?.map(x=>x.name == 'http://gedcomx.org/Primary').reduce((x,y) => x || y)) ans.add(g7s('_RUFNAM', part.value))
      }
      else if (part.type == 'http://gedcomx.org/Surname')
        ans.add(g7s('SURN', part.value))
      else if (part.qualifiers?.map(x=>x.name == 'http://gedcomx.org/Familiar').reduce((x,y) => x || y)) ans.add(g7s('NICK', part.value))
      // many other name qualifiers exist, but have no parallel in g7
    })
    if (name.lang) {
      if (tag == 'NAME') ans.add(g7s('_LANG', name.lang))
      else ans.add(g7s('LANG', name.lang))
    } else if (tag == 'TRAN') {
      ans.add(g7s('LANG','und'))
    }
    return ans
  }
  const doName = (name, level) => {
    // nameForms (non-empty, preference order)
    let ans = doNameForm(name.nameForms[0], 'NAME')
    name.nameForms.slice(1).forEach(n => ans.add(doNameForm(n, 'TRAN')))
    // type
    switch(name.type) {
      case 'http://gedcomx.org/BirthName':
        ans.add(g7s('TYPE','BIRTH')); break;
      case 'http://gedcomx.org/MarriedName':
        ans.add(g7s('TYPE','MARRIED')); break;
      case 'http://gedcomx.org/AlsoKnownAs':
        ans.add(g7s('TYPE','AKA')); break;
      case 'http://gedcomx.org/Nickname':
        ans.add(g7s('TYPE','AKA', g7s('PHRASE','Nickname'))); break;
        break;
      case 'http://gedcomx.org/AdoptiveName':
        ans.add(g7s('TYPE','OTHER', g7s('PHRASE','Adoptive name'))); break;
        break;
      case 'http://gedcomx.org/FormalName':
        ans.add(g7s('TYPE','OTHER', g7s('PHRASE','Formal name'))); break;
        break;
      case 'http://gedcomx.org/ReligiousName':
        ans.add(g7s('TYPE','OTHER', g7s('PHRASE','Religious name'))); break;
        break;
    }
    if (name.date) {
      let d = doDate(name.date)
      if (d) { d.tag = '_DATE'; ans.add(d) }
    }
    name.sources?.forEach(s => ans.add(g7s('SOUR', doSource(s))))
    if ('lang' in name && !ans.subs.map(s => s.tag == '_LANG').reduce((x,y)=>x||y)) {
      ans.add(g7s('_LANG', name.lang))
    }
    name.notes?.forEach(n => ans.add(doNote(n)))
    // to do: other conclusion fields like id, contributor, etc
    return ans
  }

  
  
  
  
  
  
  
  /** INDI records */
  const doPerson = p => {
    let me = records['#'+p.id] || g7s('INDI', null, g7s('EXID', p.id, g7s('TYPE','https://gedcom.io/exid-type/FamilySearch-PersonId')))
    let modified = 0
    let didLiving = false
    
    // fix me: evidence
    
    if (p.gender) { // SEX
      switch(p.gender.type) {
        case 'http://gedcomx.org/Male': me.add(g7s('SEX','M')); break
        case 'http://gedcomx.org/Female': me.add(g7s('SEX','F')); break
        case 'http://gedcomx.org/Unknown': me.add(g7s('SEX','U')); break
        case 'http://gedcomx.org/Intersex': me.add(g7s('SEX','X')); break
        default: me.add(g7s('FACT', p.gender.type, g7s('TYPE', 'Gender'))); break
      }
      if (p.gender.modified && p.gender.modified > modified) modified = p.gender.modified
    }
    
    // fix me: links
    
    p.sources?.forEach(s => me.add(g7s('SOUR', doSource(s))))
    
    // fix me: identifiers
    
    p.names?.forEach(n => me.add(doName(n))) // NAME
    p.names?.forEach(n => { if (n.attribution?.modified) modified = Math.max(modified, n.attribution.modified) })
    
    p.facts?.forEach(f => me.add(doIndividualFact(f)))
    
    if (p.display?.ascendancyNumber) gennumber[p.display.ascendancyNumber] = me
    if (p.display?.descendancyNumber) gennumber[p.display.descendancyNumber] = me
    // fix me: rest of display

    p.notes?.forEach(n => me.add(doNote(n)))
    // fix me: rest of conclusion: confidence, attribution, etc
    
    
    if (p.personInfo) { // RESN
      let tmp = p.personInfo[0]
      let bits = []
      if (tmp.readOnly) bits.push('LOCKED')
      if (!tmp.visibleToAll) bits.push('PRIVACY','CONFIDENTIAL')
      else if (tmp.privateSpaceRestricted) bits.add('CONFIDENTIAL')
      if (bits.length > 0) me.add(g7s('RESN', bits.join(', ')))
    }
    
    if (!didLiving) { // 1 DEAT Y   or   1 NO DEAT
      if (p.living === false) me.add(g7s('DEAT', 'Y'))
      else if (p.living) me.add(g7s('NO','DEAT'))
    }
    if (modified) me.add(g7s('CHAN',null,doDate(modified)))
    records['#'+p.id] = me
    me.resourceId = p.id // not displayed, just for local interlinks
  }

  
  const makeOrFindFam = (p1,p2) => {
    let id = [p1?.resourceId,p2?.resourceId].sort().join('+')
    if (id in records) return records[id]
    let ans = g7s('FAM',null,
      p1?g7s('HUSB', records['#'+p1.resourceId]):null,
      p2?g7s('WIFE', records['#'+p2.resourceId]):null,
    )
    records[id] = ans
    if (p1) records['#'+p1.resourceId].add(g7s('FAMS', ans))
    if (p2) records['#'+p2.resourceId].add(g7s('FAMS', ans))
    return ans
  }
  
  const doIndividualFact = f => {
    const etags = {
      // individual events
      "http://gedcomx.org/Adoption": "ADOP",
      "http://gedcomx.org/Baptism": "BAPM",
      "http://gedcomx.org/BarMitzvah": "BARM",
      "http://gedcomx.org/BatMitzvah": "BASM",
      "http://gedcomx.org/Birth": "BIRT",
      "http://gedcomx.org/Blessing": "BLES",
      "http://gedcomx.org/Burial": "BURI",
      "http://gedcomx.org/Census": "CENS",
      "http://gedcomx.org/Christening": "CHR",
      "http://gedcomx.org/AdultChristening": "CHRA",
      "http://gedcomx.org/Confirmation": "CONF",
      "http://gedcomx.org/Cremation": "CREM",
      "http://gedcomx.org/Death": "DEAT",
      "http://gedcomx.org/Emigration": "EMIG",
      "http://gedcomx.org/FirstCommunion": "FCOM",
      "http://gedcomx.org/Graduation": "GRAD",
      "http://gedcomx.org/Immigration": "IMMI",
      "http://gedcomx.org/Naturalization": "NATU",
      "http://gedcomx.org/Ordination": "ORDN",
      "http://gedcomx.org/Probate": "PROB",
      "http://gedcomx.org/Retirement": "RETI",
      "http://gedcomx.org/Will": "WILL",
    }
    const atags = {
      "http://gedcomx.org/Caste": "CAST",
      "http://gedcomx.org/PhysicalDescription": "DSCR",
      "http://gedcomx.org/Education": "EDUC",
      "http://gedcomx.org/NationalId": "IDNO",
      "http://gedcomx.org/NumberOfChildren": "NCHI",
      "http://gedcomx.org/NumberOfMarriages": "NMR",
      "http://gedcomx.org/Occupation": "OCCU",
      "http://gedcomx.org/Property": "PROP",
      "http://gedcomx.org/Religion": "RELI",
      "http://gedcomx.org/Residence": "RESI",
      "http://familysearch.org/v1/TitleOfNobility": "TITL",
    }
    const evens = {
      "http://gedcomx.org/Amnesty": "A person's amnesty.",
      "http://gedcomx.org/Arrest": "A person's arrest.",
      "http://gedcomx.org/BirthNotice": "A person's birth notice, such as posted in a newspaper or other publishing medium.",
      "http://gedcomx.org/Circumcision": "A person's circumcision.",
      "http://gedcomx.org/Court": "The appearance of a person in a court proceeding.",
      "http://gedcomx.org/EducationEnrollment": "A person's enrollment in an educational program or institution.",
      "http://gedcomx.org/Enslavement": "The enslavement of a person.",
      "http://gedcomx.org/Excommunication": "A person's excommunication from a church.",
      "http://gedcomx.org/Funeral": "A person's funeral.",
      "http://gedcomx.org/GenderChange": "A person's gender change.",
      "http://gedcomx.org/Imprisonment": "A person's imprisonment.",
      "http://gedcomx.org/Inquest": "A legal inquest. Inquests usually only occur when there’s something suspicious about the death. Inquests might in some instances lead to a murder investigation. Most people that die have a death certificate wherein a doctor indicates the cause of death and often indicates when the decedent was last seen by that physician; these require no inquest.",
      "http://gedcomx.org/LandTransaction": "A land transaction enacted by a person.",
      "http://gedcomx.org/MilitaryAward": "A person's military award.",
      "http://gedcomx.org/MilitaryDischarge": "A person's military discharge.",
      "http://gedcomx.org/MilitaryDraftRegistration": "A person's registration for a military draft.",
      "http://gedcomx.org/MilitaryInduction": "A person's military induction.",
      "http://gedcomx.org/Mission": "A person's church mission.",
      "http://gedcomx.org/MoveFrom": "A person's move (i.e., change of residence) from a location.",
      "http://gedcomx.org/MoveTo": "A person's move (i.e., change of residence) to a new location.",
      "http://gedcomx.org/MultipleBirth": "A fact that a person was born as part of a multiple birth (e.g., twin, triplet, etc.).",
      "http://gedcomx.org/Pardon": "A person's legal pardon.",
      "http://gedcomx.org/Retirement": "A person's retirement.",
      "http://gedcomx.org/Stillbirth": "A person's stillbirth.",
      "http://gedcomx.org/TaxAssessment": "A person's tax assessment.",
      "http://gedcomx.org/Visit": "A person's visit to a place different from the person's residence.",
      "http://gedcomx.org/Yahrzeit": "A person's yahrzeit date. A person's yahrzeit is the anniversary of their death as measured by the Hebrew calendar.",
    }
    const facts = {
      "http://gedcomx.org/AncestralHall": "A person's ancestral hall. An ancestral hall refers to a location where the early ancestors of the person originated. It may also refer to the name of an early ancestor. Family clans are often distinguished one from another by the ancestral hall. Clans that cannot prove direct relationships to other clans with the same surname can assume a direct relationship if they share the same ancestral hall.",
      "http://gedcomx.org/AncestralPoem": "A person's ancestral poem. An ancestral poem (or generation poem) is composed of the \"generation characters\" that are to be used when choosing names for the members of different generations of an extended family. Ancestral poems are prominent in Asian countries, particularly China.",
      "http://gedcomx.org/Apprenticeship": "A person's apprenticeship.",
      "http://gedcomx.org/Award": "A person's award (medal, honor).",
      "http://gedcomx.org/Branch": "A person's branch within an extended clan.",
      "http://gedcomx.org/Clan": "A person's clan.",
      "http://gedcomx.org/Ethnicity": "A person's ethnicity.",
      "http://gedcomx.org/GenerationNumber": "A person's generation number, indicating the number of generations the person is removed from a known \"first\" ancestor.",
      "http://gedcomx.org/Heimat": "A person's heimat. \"Heimat\" refers to a person's affiliation by birth to a specific geographic place. Distinct heimaten are often useful as indicators that two persons of the same name are not likely to be closely related genealogically. In English, \"heimat\" may be described using terms like \"ancestral home\", \"homeland\", or \"place of origin\".",
      "http://gedcomx.org/Language": "A language spoken by a person.",
      "http://gedcomx.org/Living": "A record of a person's living for a specific period. This is designed to include \"flourish\", defined to mean the time period in an adult's life where he was most productive, perhaps as a writer or member of the state assembly. It does not reflect the person's birth and death dates.",
      "http://gedcomx.org/MaritalStatus": "A person's marital status.",
      "http://gedcomx.org/Medical": "A person's medical record, such as for an illness or hospital stay.",
      "http://gedcomx.org/MilitaryService": "A person's military service.",
      "http://gedcomx.org/Nationality": "A person's nationality.",
      "http://gedcomx.org/Obituary": "A person's obituary.",
      "http://gedcomx.org/OfficialPosition": "A person's official (government) position.",
      "http://gedcomx.org/Race": "The declaration of a person's race, presumably in a historical document.",
      "http://gedcomx.org/Tribe": "A person's tribe.",
      "http://familysearch.org/v1/LifeSketch": "Life sketch",
    }
    let ans;
    if (f.type in etags) {
      ans = g7s(etags[f.type])
      if (f.value) ans.add(g7s('TYPE', f.value))
    } else if (f.type in atags) {
      ans = g7s(atags[f.type], f.value)
      if (ans.tag == 'IDNO') ans.add(g7s('TYPE','Unspecified')) // fix me: figure out why no NationalId fields have nations in FS data I've seen
    } else if (f.type in evens) {
      ans = g7s('EVEN', null, g7s('TYPE', evens[f.type]))
      if (f.value) ans.add(g7s('NOTE', f.value))
    } else if (f.type in facts) {
      ans = g7s('FACT', f.value, g7s('TYPE', facts[f.type]))
    } else if (f.type.startsWith('data:')) {
      ans = g7s('EVEN', f.value, g7s('TYPE', parseDataURL(f.type)))
    } else {
      error("Unknown person fact type: "+f.type)
    }
    if (f.date) ans.add(doDate(f.date))
    if (f.place) ans.add(doPlace(f.place)) // FIX ME: implement 
    f.sources?.forEach(s => ans.add(g7s('SOUR', doSource(s))))
    if (f.qualifiers) f.qualifiers.forEach(q => {
      switch(q.name) {
        case 'http://gedcomx.org/Age': ans.add(g7s('AGE',q.value)); break;
        case 'http://gedcomx.org/Cause': ans.add(g7s('CAUS',q.value)); break;
        case 'http://gedcomx.org/Religion': ans.add(g7s('RELI '+q.value)); break;
        case 'http://gedcomx.org/Transport': ans.add(g7s('NOTE','transported via '+q.value)); break;
        case 'http://gedcomx.org/NonConsensual': ans.add(g7s('NOTE','nonconsensual')); break;
        default: ans.add(g7s('NOTE',q.type+' is '+q.value)); break;
      }
    })
    if (ans.subs.length == 0 && !ans.payload) ans.payload = 'Y'
    return ans
  }
  const doRelationshipFact = f => {
    const etags = {
      "http://gedcomx.org/Annulment": "ANUL",
      "http://gedcomx.org/Census": "CENS",
      "http://gedcomx.org/Divorce": "DIV",
      "http://gedcomx.org/DivorceFiling": "DIVF",
      "http://gedcomx.org/Engagement": "ENGA",
      "http://gedcomx.org/MarriageBanns": "MARB",
      "http://gedcomx.org/MarriageContract": "MARC",
      "http://gedcomx.org/MarriageLicense": "MARL",
      "http://gedcomx.org/Marriage": "MARR",
        // no gx parallel for MARS
    }
    const atags = {
        "http://gedcomx.org/Residence": "RESI",
        "http://gedcomx.org/NumberOfChildren": "NCHI",
    }
    const evens = {
        "http://gedcomx.org/CommonLawMarriage": "A marriage by common law.",
        "http://gedcomx.org/CivilUnion": "A civil union of a couple.",
        "http://gedcomx.org/DomesticPartnership": "A domestic partnership of a couple.",
        "http://gedcomx.org/MarriageNotice": "A marriage notice.",
        "http://gedcomx.org/Separation": "A couple's separation.",
    }
    const facts = {
    }

    let ans;
    if (f.type in etags) {
      ans = g7s(etags[f.type])
      if (f.value) ans.add(g7s('TYPE', f.value))
    } else if (f.type in atags) {
      ans = g7s(atags[f.type], f.value)
    } else if (f.type in evens) {
      ans = g7s('EVEN', null, g7s('TYPE', evens[f.type]))
      if (f.value) ans.add(g7s('NOTE', f.value))
    } else if (f.type in facts) {
      ans = g7s('FACT', f.value, g7s('TYPE', facts[f.type]))
    } else if (f.type.startsWith('data:')) {
      ans = g7s('EVEN', f.value, g7s('TYPE', parseDataURL(f.type)))
    } else {
      error("Unknown family fact type: "+f.type)
    }
    if (f.date) ans.add(doDate(f.date))
    if (f.place) ans.add(doPlace(f.place)) // FIX ME: implement 
    f.sources?.forEach(s => ans.add(g7s('SOUR', doSource(s))))
    if (f.qualifiers) f.qualifiers.forEach(q => {
      switch(q.name) {
        case 'http://gedcomx.org/Cause': ans.add(g7s('CAUS',q.value)); break;
        case 'http://gedcomx.org/Religion': ans.add(g7s('RELI '+q.value)); break;
        case 'http://gedcomx.org/Transport': ans.add(g7s('NOTE','transported via '+q.value)); break;
        case 'http://gedcomx.org/NonConsensual': ans.add(g7s('NOTE','nonconsensual')); break;
        default: ans.add(g7s('NOTE',q.type+' is '+q.value)); break;
      }
    })
    if (ans.subs.length == 0 && !ans.payload) ans.payload = 'Y'
    return ans
  }
  
  /** FAM records, CHIL substructures, and ASSO substructures are in relationships
   * Pass 1 looks for couples and makes first pass of FAMs
   */
  const doRelationship1 = r => {
    if (r.type != 'http://gedcomx.org/Couple') return
    if (!('#'+r.person1.resourceId in records))
      records['#'+r.person1.resourceId] = g7s('INDI',null,g7s('EXID',r.person1.resourceId,g7s('TYPE','https://gedcom.io/exid-type/FamilySearch-PersonId')))
    if (!('#'+r.person2.resourceId in records))
      records['#'+r.person2.resourceId] = g7s('INDI',null,g7s('EXID',r.person2.resourceId,g7s('TYPE','https://gedcom.io/exid-type/FamilySearch-PersonId')))
    let id = [r.person1.resourceId,r.person2.resourceId].sort().join('+')
    let fam = makeOrFindFam(r.person1, r.person2)
    fam.add(g7s('EXID', r.id, g7s('TYPE', 'https://gedcom.io/exid-type/FamilySearch-RelationshipId'))) // FIX ME: register this type
    r.facts?.forEach(f => fam.add(doRelationshipFact(f)))
    r.sources?.forEach(s => fam.add(g7s('SOUR', doSource(s))))
  }
  
  const isWife = per => { // guess if this person is a WIFE
    let ans = null
    per.subs.forEach(s => { 
      if (s.tag == 'SEX' && s.paylaod == 'F') ans = true
      if (s.tag == 'SEX' && s.paylaod == 'M') ans = false
    })
    if ('boolean' == typeof ans) return ans
    per.subs.forEach(s => { 
      if (s.tag == 'FAMS') {
        s.payload.subs.forEach(f => {
          if (f.tag == 'WIFE' && f.payload == per) ans = true
          if (f.tag == 'HUSB' && f.payload == per) ans = false
        })
      }
    })
    return ans
  }
  
  const doGenerationCode = ([num, per]) => {
    // unclear: if person in twice, how is that handled?
    if (num.includes('-S') || num.includes('.')) {
      let [_, prev, here] = /^(.*)[-.]([S0-9]+)$/.exec(num)
      if (!(prev in gennumber))
        throw new Error(`Generation number ${num} without ${prev}`)
      per2 = gennumber[prev]
      if (here[0] == 'S') { // spouse
        let marnum = here == 'S'? 1 : Number(here.substr(2)) // unused
        let wife = isWife(per)
        if ('boolean' != typeof wife) wife = !isWife(per2)
        let [father, mother] = wife ? [per2, per] : [per, per2]
        let fam = makeOrFindFam(father, mother)
        if (!(num in famof)) famof[num] = fam
      } else { // child
        let chilnum = Number(here)
        let fam = famof[prev]
        if (!fam) {
          fam = isWife(per2) ? makeOrfindFam(null,per2) : makeOrFindFam(per2,null)
          famof[prev] = fam
        }
        if (fam.subs.filter(s => s.tag == 'CHIL' && s.payload == per).length == 0) {
          per.add(g7s('FAMC',fam))
          for(let i=0; i<fam.subs.length; i+=1) if (fam.subs[i].tag == 'CHIL') {
            chilnum -= 1
            if (chilnum == 0) {
              if (fam.subs[i].payload == '@VOID@') fam.subs[i].payload = per
              else fam.subs.splice(i,0,g7s('CHIL',per))
              break
            }
          }
          if (chilnum > 0) {
            while(chilnum > 1) { fam.add(g7s('CHIL','@VOID@')); chilnum -= 1; }
            fam.add(g7s('CHIL',per))
          }
        }
      }
    } else {
      num = Number(num)
      let father = String(num*2)
      let mother = String(num*2+1)
      if (father in gennumber || mother in gennumber) {
        let fam = makeOrFindFam(gennumber[father], gennumber[mother])
        fam.add(g7s('CHIL', per))
        per.add(g7s('FAMC', fam))
        if (!(father in famof)) famof[father] = fam
        if (!(mother in famof)) famof[mother] = fam
      }
    }
  }
  
  
  /* The following are populated by doPerson
   * combines ahnentafel integers: i's father is 2i and mother is 2i+1
   * and d'aboville strings: i ( "-S"\d* | "."\d+ ) -S2 = 2nd spouse, .3 = 3rd child
   */
  const gennumber = {}
  
  const famof = {} // d'aboville default family of person
  
  gx.persons?.forEach(doPerson)
  gx.relationships?.forEach(doRelationship1)
  // note: relations will add substructures to existing persons
  
  Object
    .entries(gennumber)
    .sort((a,b)=>a[0].length-b[0].length || a[0].localeCompare(b[0]))
    .forEach(doGenerationCode)
  
  
  
  
  
  if (extensions) header.add(g7s('SCHMA',null, ...extensions))
  return header + Object.values(records).join('') + trailer
}
