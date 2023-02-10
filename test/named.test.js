import { registerFlow, instantiateFlow } from '../ruleflow.js';

const doubleFlow = `
[rator "double" "let [[_in, n]] = yield; while (true) {[[_in, n]] = yield [['out', n*2]]}"]
[rand "double" "in"]
[ret "double" "out"]
`;

registerFlow('double', doubleFlow);

const flow = `
[rator 1 "yield; for (let n = 1; n <= 4; n++) yield [['out', n]];"]
[ref 2 "double"]
[rator 3 "while (true) {const [[_in, n]] = yield; console.log('out ' + n)}"]

[link 1 "out" 2 "in"]
[link 2 "out" 3 "in"]
`;

registerFlow('flow', flow);
instantiateFlow('flow');
