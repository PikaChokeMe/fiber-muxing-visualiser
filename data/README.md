# Color data attribution

**CIE (2019), Colour-matching functions of CIE 1931 standard colorimetric observer.**
International Commission on Illumination (CIE), Vienna, AT.
DOI: https://doi.org/10.25039/CIE.DS.xvudnb9b

Source: https://cie.co.at/datatable/cie-1931-colour-matching-functions-2-degree-observer

License: **Creative Commons Attribution-ShareAlike 4.0 International**
https://creativecommons.org/licenses/by-sa/4.0/

The original CSV and metadata are bundled without modification. `cie1931.js` is a
format conversion of the CSV's X, Y, Z columns into a JavaScript array, indexed
from 360 through 830 nm. Numeric values are unchanged. This converted dataset is
also distributed under CC BY-SA 4.0. Attribution and license must accompany redistribution.

CSV MD5: `17cca777db64b17170f06f67ce9d3ab7` (verified by automated test).

The app linearly interpolates fractional wavelengths. It deliberately uses
380–780 nm as its visible-mode range; this is a visualization convention, not a
claim of a precise physiological cutoff. Outside it, physical-view contributions
are zero. Optional false-color substitutes are explicitly illustrative.
