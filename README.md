# Project goal

The goal of this project is to convert FamilySearch Family Tree's dialect of GEDCOM X (hereinafter gx) to FamilySearch GEDCOM 7.0 (hereinafter g7).
It is written in pure dependency-free JavaScript, with the intent that it could be used as a client-size function in the browser or with any server-side JavaScript engine.

# Status

The code in `xto70.js` captures over 90% of the content in a few example JSON exports from Family Tree.
For those example files, the GEDCOM it produces does validate with <http://ged-inline.elasticbeanstalk.com/>.

The approach used so far has been focused on getting something working quickly.
It is not very maintainable and gives no assurance that data is not omitted.
I expect to do a slower, more careful re-implementation in the future,
likely with its own validation pass.

The current code assumes one gx JSON object creates one g7 dataset.
gx APIs generally require multiple queries to retrieve all the relevant data,
meaning it will need to be adjusted to handle merging multiple objects at some point.
Design for that has not yet begun.

## Known applications using this code

- <https://gedcom.surge.sh> lets you download a `.ged` file representing your immediate ancestors as stored in the FamilySearch Family Tree.

I'm in conversations with multiple other tool developers about the potential for other, more feature-rich applications;
hopefully this section will grow soon.


# Usage

```js
let gx = JSON.parse(gxFromFamilySearchAPI)
let g7 = GEDCOMXTo7(gx, console.error)
// here g7 is a string containing an entire GEDCOM 7.0 dataset
```

If you run this on in a web browser client and want to let the user save the result as a file, you can use a function like this:

```js
(function (g7) {
    var blob = new Blob([g7], {type:'text/vnd.familysearch.gedcom'})
    var a = document.createElement('a')
    var ex = "xto7-"+new Date().toISOString().replace(/[.].*|[^0-9]/g,'')+".ged"
    var name = prompt("Save as what file name?", ex)
    if (!name) return
    a.setAttribute('download', name)
    a.setAttribute('target', '_blank')
    a.href = URL.createObjectURL(blob)
    document.body.append(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
})(g7)
```

# Limitations 

This will not be perfect for at least the following reasons:

- g7 does not have gx's notion of "evidence".
- gx allows some substructures (such as attribution) under nearly every structure, while g7 puts the corresponding structures under just a few structures.
- gx has *many* more "fact types" than g7 has event and attribute types.
- gx has much more flexible structures for names and places than g7
- g7's `FAM` represents "a couple and their children"; gx's relationships are pair-wise (parent-child and couple) instead. There are a few rare corner cases where converting between these two either fabricates new or removes old nuances of meaning.

It is likely this list will grow as the implementation continues.

It is unlikely that this will ever be changed to a streaming parser because both gx and g7 use internal links extensively, but in different ways meaning the links cannot simply be converted between the two formats and random access to data is needed.

# License

This code is released under a mix of MIT and UNLICENSE.
Each file contains either the MIT license
or both licenses in a comment at the top of the file.
If it contains both, it also includes the following statement:

> This code is dual licensed under the Unlicense and MIT licenses. Specifically, you may use it under the terms of either license, and may remove the text of the other license (along with this notice) from your redistribution of this code if you so desire.

The dual licensing is motivated by the following observations:

- I, Luther Tychonievich, would like to participate in a small bit of ideological activism by promoting the Unlicense's goal: to disclaim copyright monopoly interest.
- I would also like as many people to use the code as possible. Since the Unlicense is not a proven or well known license, I also offer this code under the MIT license, which is ubiquitous and accepted by almost everyone.
- Some of my potential collaborators are uncomforable distributing code they contribute under the Unlicense; hence, files they contribute to may be licensed under the MIT license only.

More specifically, this code and all its dependencies are compatible with this licensing choice. Any dependencies (direct and transitive) will always be limited to permissive licenses. This code will never depend on code that is not permissively licensed. This means rejecting any dependency that uses a copyleft license such as the GPL, LGPL, MPL or any of the Creative Commons ShareAlike licenses.


# Contributing

Reports of errors or gaps in the code are very welcome, preferably as [issues on github](https://github.com/gedcom7code/xto7/issues).
Pull requests extending functionality or fixing errors are also welcome.

Example files are also welcome.
I do not have a FamilySearch Family Tree developer key and thus have been dependent on the generosity of others to share the files I've been testing so far.
If you would like to give me more files exploring other aspects of the FS API, that would be most welcome.
The example files that I have been given were not given with permission to be shared, so they do not appear in this repository.
