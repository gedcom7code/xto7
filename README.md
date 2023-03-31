# Project goal

The goal of this project is to convert FamilySearch Family Tree's dialect of GEDCOM X (hereinafter gx) to FamilySearch GEDCOM 7.0 (hereinafter g7).
It is written in pure dependency-free JavaScript, with the intent that it could be used as a client-size function in the browser or with any server-side JavaScript engine.

# Status

The code in `xto70.js` captures over 90% of the content in a few example JSON experts from Family Tree.
For those example files, the GEDCOM it produces does validate with <http://ged-inline.elasticbeanstalk.com/>.

The approach used so far has been focused on getting something working quickly.
It is not very maintainable and gives no assurance that data is not omitted.
I expect to do a slower, more careful re-implementation in the future,
likely with its own validation pass.

The current code assumes one gx JSON object creates one g7 dataset.
gx APIs generally require multiple queries to retrieve all the relevant data,
meaning it will need to be adjusted to handle merging multiple objects at some point.
Design for that has not yet begun.

# Usage

```js
let gx = JSON.parse(gxFromFamilySearchAPI)
let g7 = GEDCOMXTo7(gx, console.error)
// here g7 is a string containing an entire GEDCOM 7.0 dataset
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

This is free and unencumbered software released into the public domain. Anyone is free to copy, modify, publish, use, compile, sell, or distribute this software, either in source code form or as a compiled binary, for any purpose, commercial or non-commercial, and by any means. See <LICENSE> for more.

If anyone wishes to use this software but is worried about the relative newness of The Unlicense, let me know and I can add additional licenses it can also be used under.

# Contributing

Reports of errors or gaps in the code are very welcome, preferably as [issues on github](https://github.com/gedcom7code/xto7/issues).
Pull requests extending functionality or fixing errors are also welcome.

Example files are also welcome.
I do not have a FamilySearch Family Tree developer key and thus have been dependent on the generosity of others to share the files I've been testing so far.
If you would like to give me more files exploring other aspects of the FS API, that would be most welcome.

Those I have been given were not given with permission to be shared, so they do not appear in this repository.
