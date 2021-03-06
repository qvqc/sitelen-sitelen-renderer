/*global
 sitelenCoreRenderer
 */

/**
 * Produces all the different layout options for a given structured sentence.
 *
 * @type {{layoutCompound}}
 */
var sitelenLayout = function () {
    'use strict';

    /**
     * Obtain the layout of an entire container and its children.
     *
     * @param units the units to layout, can be glyphs, syllables or containers
     * @returns {Array} a laid out container
     */
    function layoutContainer(units) {
        var options = [], hash = {}, minSurface = 1e6;

        function normalizeOption(option) {
            option = JSON.parse(option);

            var minSize = 1;
            option.state.units.forEach(function (glyph) {
                if (glyph.size[0] < minSize) {
                    minSize = Math.max(glyph.size[0], glyph.size[1]);
                }
            });

            option.size = [option.size[0] / minSize, option.size[1] / minSize];
            option.surface /= minSize * minSize;
            option.state.units.forEach(function (glyph) {
                glyph.size[0] /= minSize;
                glyph.size[1] /= minSize;
                glyph.position[0] /= minSize;
                glyph.position[1] /= minSize;
            });

            return option;
        }

        function go(units, state, iterator) {
            var newSize, newState, newForbidden, i, j,
                goesDown, index, length,
                prevSize, unitPosition, newOption;

            // place the first unit directly
            if (!state) {
                var singleSize = units[0].size;
                newState = {
                    units: [{unit: units[0], size: singleSize, position: [0, 0]}],
                    size: singleSize,
                    forbidden: [JSON.stringify(singleSize)]
                };

                if (units.length === 1) {
                    newOption = {
                        type: 'container',
                        state: newState,
                        size: singleSize,
                        ratio: singleSize[0] / singleSize[1],
                        normedRatio: singleSize[0] / singleSize[1] < 1 ? singleSize[0] / singleSize[1] : singleSize[1] / singleSize[0],
                        surface: singleSize[0] * singleSize[1]
                    };
                    options.push(newOption);
                    hash[JSON.stringify(newOption)] = newOption;
                    return;
                }
                for (j = 1; j < units.length; j++) {
                    // prevent punctuation elements to be placed to the right, alone
                    if (units[1].type !== 'punctuation') {
                        go(units, newState, {goesDown: false, index: 1, length: j});
                    }
                    go(units, newState, {goesDown: true, index: 1, length: j});
                }
                return;
            }

            // set up aliases, start parameters and clone the state
            goesDown = iterator.goesDown;
            index = iterator.index;
            length = iterator.length;
            newState = JSON.parse(JSON.stringify(state));
            newSize = newState.size;
            newForbidden = newState.forbidden;
            prevSize = units[index].size;
            unitPosition = [!goesDown ? state.size[0] : 0, goesDown ? state.size[1] : 0];

            // determine size sum and check if all following glyphs are compatible
            var sizeSum = [0, 0], addSize;
            for (i = index; i < index + length; i++) {
                addSize = units[i].size;
                if ((goesDown && addSize[1] !== prevSize[1]) ||
                    (!goesDown && addSize[0] !== prevSize[0])) {
                    return;
                }
                sizeSum = [sizeSum[0] + addSize[0], sizeSum[1] + addSize[1]];
            }

            // now add the units one by one
            for (i = index; i < index + length; i++) {
                var glyphSize = [], add = 0,
                    addAxis = goesDown ? 1 : 0,
                    fixedAxis = goesDown ? 0 : 1;

                addSize = units[i].size;

                add = addSize[addAxis] * state.size[fixedAxis] / sizeSum[fixedAxis];
                glyphSize[addAxis] = add;
                glyphSize[fixedAxis] = addSize[fixedAxis] * add / addSize[addAxis];

                if (i === index) {
                    newSize[addAxis] += add;
                }
                if (goesDown && newForbidden.indexOf(JSON.stringify(unitPosition)) > -1) {
                    return;
                }

                newState.units.push({unit: units[i], size: glyphSize, position: unitPosition});

                // update glyph position to slot for next glyph
                unitPosition = [unitPosition[0] + (goesDown ? glyphSize[0] : 0),
                    unitPosition[1] + (!goesDown ? glyphSize[1] : 0)];

                // forbid next glyphs to start at the lower-right corner of a previous glyph (this breaks the reading flow rules
                newForbidden.push(JSON.stringify([unitPosition[0] + (!goesDown ? glyphSize[0] : 0),
                    unitPosition[1] + (goesDown ? glyphSize[1] : 0)]));
            }

            // if all units are used up we can stop and add the final result
            if (index + length === units.length) {
                newOption = {
                    type: 'container',
                    state: newState,
                    size: newSize,
                    ratio: newSize[0] / newSize[1],
                    normedRatio: newSize[0] / newSize[1] < 1 ? newSize[0] / newSize[1] : newSize[1] / newSize[0],
                    surface: newSize[0] * newSize[1]
                };

                newOption = normalizeOption(JSON.stringify(newOption));

                minSurface = Math.min(minSurface, newOption.surface);

                // surface can't be 2 times larger than the optimum
                if (!hash[JSON.stringify(newOption)] && newOption.surface / minSurface < 2) {
                    options.push(newOption);
                    hash[JSON.stringify(newOption)] = newOption;
                }
                return;
            }

            for (j = 1; j < units.length - (index + length) + 1; j++) {
                // prevent punctuation elements to be placed to the right, alone
                if (units[index + length].type !== 'punctuation') {
                    go(units, newState, {goesDown: false, index: index + length, length: j});
                }
                go(units, newState, {goesDown: true, index: index + length, length: j});
            }
        }

        go(units);
        return options;
    }

    /**
     * Obtain the layout of the glyphs in a single container.
     *
     * @param tokens    the tokens in a container
     * @returns {Array|*}   the laid out container
     */
    function convertNounPhrase(tokens) {
        var smallModifiers = ['kon', 'lili', 'mute', 'sin'],
            narrowModifiers = ['wan', 'tu', 'anu', 'en', 'kin'],
            punctuation = ['period', 'exclamation', 'question'],
            singlePunctuation = ['comma', 'colon'],
            largePunctuation = ['la', 'banner'],
            options;

        function getSizeOf(token) {
            if (singlePunctuation.indexOf(token) > -1) {
                return [4, 0.5];
            } else if (punctuation.indexOf(token) > -1) {
                return [4, 0.75];
            } else if (largePunctuation.indexOf(token) > -1) {
                return [4, 1];
            } else if (smallModifiers.indexOf(token) > -1) {
                return [1, 0.5];
            } else if (narrowModifiers.indexOf(token) > -1) {
                return [0.5, 1];
            } else {
                return [1, 1];
            }
        }

        var units = [];
        tokens.forEach(function (token) {
            units.push({rule: 'word-glyph', token: token, size: getSizeOf(token)});
        });

        options = layoutContainer(units);

        return options;
    }

    /**
     * Obtain the layout of the syllables in a cartouche.
     *
     * @param tokens    the tokens in a cartouche
     * @returns {Array|*}   the laid out cartouche syllables
     */
    function convertCartouche(tokens) {
        var narrowSyls = ['li', 'ni', 'si', 'lin', 'nin', 'sin', 'le', 'ne', 'se', 'len', 'nen', 'sen', 'lo', 'no', 'so', 'lon', 'non', 'son', 'la', 'na', 'sa', 'lan', 'nan', 'san', 'lu', 'nu', 'su', 'lun', 'nun', 'sun'],
            options;

        function getSizeOf(token) {
            if (narrowSyls.indexOf(token) > -1) {
                return [0.5, 1];
            } else {
                return [1, 1];
            }
        }

        var units = [];
        tokens.forEach(function (token) {
            units.push({rule: 'syl-glyph', token: token, size: getSizeOf(token)});
        });

        options = layoutContainer(units);

        return options;
    }

    /**
     * Obtain the layout of a complex compound sentence.
     *
     * @param sentence  the compounds of a sentence
     * @returns {Array} the full layout
     */
    function layoutCompound(sentence) {
        var hashMap = [], compoundOptions = [];

        sentence.forEach(function (part) {
            var npOptions = [];
            if (part.parts) {
                npOptions = layoutCompound(part.parts);
            } else if (part.sep === 'cartouche') {
                npOptions = convertCartouche(part.tokens);
            } else {
                npOptions = convertNounPhrase(part.tokens);
            }

            hashMap.push({part: part.part, sep: part.sep, options: npOptions});
        });

        function go(index, units) {
            hashMap[index].options.forEach(function (option) {
                var newIndex = index + 1,
                    newUnits = units.slice(0);

                option.type = hashMap[index].part === 'punctuation' ? 'punctuation' : 'container';
                option.separator = hashMap[index].sep;
                newUnits.push(option);
                if (newIndex < hashMap.length) {
                    go(newIndex, newUnits);
                } else {
                    compoundOptions.push.apply(compoundOptions, layoutContainer(newUnits));
                }
            });
        }

        if (hashMap.length > 0) {
            go(0, []);
        } else {
            console.log('WARNING: empty text to layout');
        }
        return compoundOptions;
    }

    return {
        layoutCompound: layoutCompound
    };
}();
