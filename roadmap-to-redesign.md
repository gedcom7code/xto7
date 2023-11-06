This document tracks a planned full re-write. The current main branch has the following concerns:

- Can generate invalid GEDCOM (at least in theory)
    - [x] create a semantic GEDCOM library that handles extension tags, etc <https://github.com/gedcom7code/js-gedcom/>
    - [ ] refactor code to use that library instead of ad-hoc GEDCOM generation
        - [x] needs `findOrAdd` function that checks EXID/UID substructures (added 2023-11-02)

- Cannot merge files
    - 8-generation JSON has all source citations as opaque URLs, omits some events
    - JSON not trivially mergeable because of ahnentafel and d'aboville strings
    - Initial code can't merge, but semantic library should make it possible
    - [ ] build a stateful driver: create, feed each JSON file, dump
        - [ ] maybe also policy-based priority queue of additional API calls to make

- Discards some information (evidence, attribution, some contributors)
    - [ ] add using extensions or NOTEs

- Some machine-parseable becomes human-only (some name part qualifiers, event types)
    - [ ] add g7 extensions to store these

- Code ugly, not maintainable
    - [ ] split out code for datatypes, d'aboville
    - [ ] add a file(?) describing how each gx structure maps to g7
        - e.g. /persons/*/facts/*/place/original maps to INDI.*.PLAC payload
        - FAM will need to be a special case, maybe others too
    - [ ] (requested by GoldieMay) add TypeScript annotations

- No test files
    - [ ] easy version: given JSON, verify it creates valid GEDCOM
    - [ ] harder version: given JSON, verify no data was lost
