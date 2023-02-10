import { registerFlow, instantiateFlow } from '../ruleflow.js';

const flow = `
[rator 1 "yield; for (let n = 1; n <= 4; n++) yield [['out', n]];"]
[ret 1 "out"]

[rator 2 "let [[_in, n]] = yield; while (true) {[[_in, n]] = yield [['out', n*2]]}"]
[rand 2 "in"]
[ret 2 "out"]

[rator 3 "while (true) {const [[_in, n]] = yield; console.log('out ' + n)}"]
[rand 3 "in"]

[link 1 "out" 2 "in"]
[link 2 "out" 3 "in"]
`;

registerFlow('flow', flow);
instantiateFlow('flow');