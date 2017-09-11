/**
 * Parsing toki pona texts into sentences and sentence parts, and then into structured sentences that reflect the
 * structure of sitelen sitelen blocks.
 *
 * @type {{parse}}
 */
var sitelenParser = function () {
    'use strict';

    /**
     * Core parser into sitelen sitelen structure.
     * @param parseable a sentence to parse
     * @returns {*[]} a structured sentence array
     */
    function getSimpleStructuredSentence(parseable) {
        var tokens = parseable.split(' '),
            prepositions = ['tawa', 'lon', 'kepeken'],
            objectMarker = ['li', 'e'],
            part = {part: 'subject', tokens: []},
            sentence = [part];

        tokens.forEach(function (token, index) {
            if (objectMarker.indexOf(token) > -1 &&
                index < tokens.length - 1) {
                sentence.push({part: 'objectMarker', sep: token, tokens: []});
                part = sentence[sentence.length - 1];
                return;
            } else if (prepositions.indexOf(token) > -1 && objectMarker.indexOf(tokens[index - 1]) === -1 &&
                index < tokens.length - 1 && objectMarker.indexOf(tokens[index + 1]) === -1) {
                sentence.push({part: 'prepPhrase', sep: token, tokens: []});
                part = sentence[sentence.length - 1];
                return;
            } else if (token === 'o' && part.tokens.length > 0) {
                // the o token should be in a container when it is used to address something, not in commands
                part.part = 'address';
                part.sep = 'o';
                sentence.push({part: 'subject', tokens: []});
                part = sentence[sentence.length - 1];
                return;
            } else if (token === 'a' && part.tokens.length > 0 && part.sep) {
                // the a token should never be in a container
                sentence.push({part: 'interjection', sep: null, tokens: [token]});
                part = sentence[sentence.length - 1];
                return;
            }

            part.tokens.push(token);
        });

        // filter out empty parts
        sentence = sentence.filter(function (part) {
            return part.tokens.length > 0;
        });
        return sentence;

    }

    /**
     * Preformats a given text, so that it splits it on punctuation marks.
     * @param text  text to preformat
     * @returns {{parsable: Array, raw: Array}} parsable array of raw text and punctuation
     */
    function preformat(text) {
        var result = text.match(/[^\.!\?#]+[\.!\?#]+/g),
            punctuation = ['.', ':', '?', '!', ','];

        var parsableParts = [], rawParts = [];
        if (!result) { // allow sentence fractions without any punctuation
            result = [text + (punctuation.indexOf(text) === -1?'|':'')];
            // console.log('WARNING: sentence fraction without punctuation');
        }
        result.forEach(function (sentence) {
            sentence = sentence.trim();

            var parsableSentence = [];
            parsableParts.push(parsableSentence);
            rawParts.push(sentence);

            var body = sentence.substr(0, sentence.length - 1);

            // remove the comma before the la-clause and before a repeating li clause
            body = body.replace(', la ', ' la ');
            body = body.replace(', li ', ' li ');

            // split on context separators comma and colon
            var laparts = body.split(/ la /);
            laparts.forEach(function (lapart, index) {
                var colonparts = lapart.split(/:/);
                colonparts.forEach(function (colonpart, index) {
                    var commaparts = colonpart.split(/,/);
                    commaparts.forEach(function (commapart, index) {
                        commapart = commapart.trim();

                        parsableSentence.push({content: commapart});
                        if (index < commaparts.length - 1) {
                            parsableSentence.push({punctuation: ['comma']});
                        }
                    });

                    if (index < colonparts.length - 1) {
                        parsableSentence.push({punctuation: ['colon']});
                    }
                });
                if (laparts.length === 2 && index === 0) {
                    parsableSentence.push({punctuation: ['la']});
                }
            });

            var terminator = sentence.substr(-1);
            switch (terminator) {
                case '.':
                    parsableSentence.push({punctuation: ['period']});
                    break;
                case ':':
                    parsableSentence.push({punctuation: ['colon']});
                    break;
                case '!':
                    parsableSentence.push({punctuation: ['exclamation']});
                    break;
                case '?':
                    parsableSentence.push({punctuation: ['question']});
                    break;
                case '#':
                    parsableSentence.push({punctuation: ['banner']});
                    break;
                default:
                    break;
            }

        });
        return {parsable: parsableParts, raw: rawParts};
    }

    /**
     * Split proper names into Toki Pona syllables. It is assumed that the proper name follows standard Toki Pona rules.
     * @param properName the proper name string to split into syllables
     */
    function splitProperIntoSyllables(properName) {
        if (properName.length === 0) {
            return [];
        }

        var vowels = ['o', 'u', 'i', 'a', 'e'],
            syllables = [],
            first = properName.substr(0, 1),
            third = properName.substr(2, 1),
            fourth = properName.substr(3, 1);

        // ponoman, monsi, akesi

        if (vowels.indexOf(first) === -1) {
            if (third === 'n' && vowels.indexOf(fourth) === -1) {
                syllables.push(properName.substr(0, 3));
                syllables = syllables.concat(splitProperIntoSyllables(properName.substr(3)));
            } else {
                syllables.push(properName.substr(0, 2));
                syllables = syllables.concat(splitProperIntoSyllables(properName.substr(2)));
            }
        } else {
            if (properName.length === 2) {
                return [properName];
            } else {
                syllables.push(first);
                syllables = syllables.concat(splitProperIntoSyllables(properName.substr(1)));
            }
        }

        return syllables;
    }

    /**
     * Postprocessing for the simple parses that splits the structured sentence into more structure, such as prepositional
     * phrases, proper names and the pi-construct.
     *
     * @param sentence  the structured sentence
     * @returns {*} a processed structured sentence
     */
    function postprocessing(sentence) {
        var prepositionContainers = ['lon', 'tan', 'kepeken', 'tawa', 'pi'],
            prepositionSplitIndex,
            nameSplitIndex;

        // split prepositional phrases inside containers (such as the verb li-container)
        sentence.forEach(function (part, index) {
            prepositionSplitIndex = -1;

            part.tokens.forEach(function (token, tokenIndex) {
                if (prepositionContainers.indexOf(token) > -1 && tokenIndex < part.tokens.length - 1) {
                    prepositionSplitIndex = tokenIndex;
                }
            });

            if (prepositionSplitIndex > -1) {
                var newParts = [];
                if (prepositionSplitIndex > 0) {
                    newParts.push({part: part.part, tokens: part.tokens.slice(0, prepositionSplitIndex)});
                }
                newParts.push({
                    part: part.part,
                    sep: part.tokens[prepositionSplitIndex],
                    tokens: part.tokens.slice(prepositionSplitIndex + 1)
                });
                sentence[index] = {part: part.part, sep: part.sep, parts: newParts};
            }
        });

        // split proper names inside containers
        sentence.forEach(function (part, index) {
            nameSplitIndex = -1;
            if (!part.tokens) {
                return;
            }
            part.tokens.forEach(function (token, tokenIndex) {
                if (token.substr(0, 1).toUpperCase() === token.substr(0, 1)) {
                    nameSplitIndex = tokenIndex;
                }
            });

            if (nameSplitIndex > -1) {
                var newParts = [];
                if (nameSplitIndex > 0) {
                    newParts.push({part: part.part, tokens: part.tokens.slice(0, nameSplitIndex)});
                }
                newParts.push({
                    part: part.part,
                    sep: 'cartouche',
                    tokens: splitProperIntoSyllables(part.tokens[nameSplitIndex].toLowerCase())
                });
                if (nameSplitIndex < part.tokens.length - 1) {
                    newParts.push({part: part.part, tokens: part.tokens.slice(nameSplitIndex + 1)});
                }
                sentence[index] = {part: part.part, sep: part.sep, parts: newParts};
            }
        });
        return sentence;
    }

    /**
     * Main parser that processes a sentence.
     *
     * @param sentence  the input sentence
     * @returns {Array} the structured sentence
     */
    function parseSentence(sentence) {
        var structuredSentence = [];

        sentence.forEach(function (part) {
            if (part.content) {
                // find proper names
                var properNames = [];
                part.content = part.content.replace(/([A-Z][\w-]*)/g, function (item) {
                    properNames.push(item);
                    return '\'Name\'';
                });

                var value = getSimpleStructuredSentence(part.content);

                value.forEach(function (part) {
                    part.tokens.forEach(function (token, index) {
                        if (token === '\'Name\'') {
                            part.tokens[index] = properNames.shift();
                        }
                    });
                });
                structuredSentence.push.apply(structuredSentence, value);
            } else if (part.punctuation) {
                structuredSentence.push({part: 'punctuation', tokens: part.punctuation});
            }
        });

        structuredSentence = postprocessing(structuredSentence);
        return structuredSentence;
    }

    /**
     * Parser wrapper that splits a text into sentences that are parsed.
     * @param text  a full text
     * @returns {Array} an array of structured sentences
     */
    function parse(text) {
        return preformat(text.replace(/\s\s+/g, ' ')).parsable.map(function (sentence) {
            return parseSentence(sentence);
        });
    }

    return {
        parse: parse
    };
}();




