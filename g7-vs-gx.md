# Comparing G7 and GX

I am part of the team that maintains [FamilySearch GEDCOM 7](https://github.com/FamilySearch/GEDCOM/) (hereinafter G7), but overall I would call [GEDCOM X](https://github.com/FamilySearch/GEDCOMX/) (hereinafter GX) a superior file format, though each has some strengths that the other lacks. However, GX has relatively little use as a file format (as of March 2026), leading to it being less practically useful as a means of data exchange.

This page tries to document significant differences between the two format's conceptual models. It ignores the more superficial differences in syntax. Note that while I am deeply familiar with G7, I have much more modest familiarity with GX so I might have missed something.

# Relationships

GX has two forms of relationship:

- gx:Relationship is a directed edge between two people
- gx:Group is a conceptual collection of people, with gx:GroupRole indicating membership in the group.

G7 has more variation in how relationships are formed:

- g7:record-FAM is the primary relationship structure, encoding
    - Couple relationships with g7:FAM-HUSB and g7:FAM-WIFE
    
    - Parent-child relationships with g7:CHIL, including birth order information in the order of these and placeholders for children known to exist only by virtue of gaps in birth order.
        
        The meaning of a CHIL may be refined by the INDI's FAMC.PEDI
        
- g7:ASSO can also associate people with and g7:record-FAM, g7:record-INDI, or any fact or event.

When going from GX to G7, as the code in this repository does, I try to find relationships that look like FAMs and place them there, using ASSO for whatever is left.
Going from G7 to GX would additionally have to decide when to make a gx:Group for a g7:record-FAM; I could see cases for never (FamilySearch doesn't seem to create gx:Group for each family made through it's UI), or only if the g7:recrd-FAM has an g7:ASSO (which otherwise would be hard to represent), or always (for consistency since it is sometimes needed for the g7:ASSO).

# Partially-controlled vocabulary

G7 has a structure g7:PHRASE that can appear in various places to allow users to enter unstructured text instead of structured information. GX does not have a similar structure. For G7-to-GX, this is not a concern: we can create g7:PHRASE when some part of GX has no G7 parallel and ignore it otherwise. For GX-to-G7, PHRASE would likely need to be converted (lossily) into something like a gx:Note.

# Notes

Both G7 and GX allow notes in many places. There are some differences:

- GX allows notes in more places than G7.
- G7 has a distinction between inline notes (g7:NOTE) and linked, shared notes (g7:SNOTE). Converting between the two is lossless, but may change the semantics of future updates to the notes.
- G7 allows notes to be in several formats using g7:MIME; GX lacks this, but G7 [includes guidance on converting to plain text](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html#MIME).

# Negative assertions

G7 has several ways to record information that is *not* true:

- g7:NO expresses that something did not occur or was not true.
- g7:FAMC-STAT has several levels, including asserting that someone was not a child of someone else.
- g7:QUAY can express doubt about many different elements of the record.

GX has only one, gx:Conclusion's `confidence` field, which roughly matches g7:QUAY in that it can only express doubt, not a confident assertion that something is false.

For G7-to-GX, this is not a concern: we simply don't create g7:NO or g7:FAMC-STAT structures. For GX-to-G7, g7:NO and g7:FAMC-STAT would likely need to be converted (lossily) into something like a gx:Note. Additionally, a g7:FAMC-STAT value of g7:enum-DISPROVEN has no obvious home in GX at all: it means there is *not* a gx:ParentChild relationship at all, and thus that there should be no gx:Relationship and no obvious place to put even a gx:Note.

# Names

G7 personal names are somewhat ideosyncratic, storing the name string (g7:INDI-NAME) and the parts of the name (g7:GIVN, g7:SURN, and so on) separately with no requirement that the two be kept in sync. In many cases the name parts can be matched unambiguously to parts of the name string to create a gx:NameForm with gx:NameParts inside, but in some cases this won't work. A common reason it might not work is the common practice of having alternative forms of name parts not used by the person but useful for searching and filtering, such as other-gendered forms of surnames.

GX names have a level of distinction that G7 lacks. Each gx:Name may have multiple gx:NameForm, allowing a distinction between unrelated names of a person (like "Augusta Ada Byron" and "Ada Lovelace") and different forms of the same name (like "Augusta Ada King, Countess of Lovelace" and "Ada Lovelace"). G7 has no similar distinction; names and name forms are both stored in g7:INDI-NAME with no way to indicate whether two g7:INDI-NAMEs represent forms of the same name or distinct names.

# ALIA

G7 has a structure g7:ALIA that allows asserting that two g7:record-INDI represent the same historical person. This structure is problematic even within the G7 ecosystem, with some applications using it extensively and others having no support for it at all. GX has no similar structure.
