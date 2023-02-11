import { registerFlow, instantiateFlow } from '../ruleflow.js';

const flow = `
[interval 1 1 4 "out"]
[map 2 "in" "n => ['Input', n]" "out"]
[rules 3 "(rule [Doubled (* n 2)] [Input n])"]
[map 4 "in" "([_, n]) => n" "out"]
[console 5 "in"]

[link 1 "out" 2 "in"]
[link 2 "out" 3 "add"]
[link 3 "added" 4 "in"]
[link 4 "out" 5 "in"]
`;

registerFlow('flow', flow);
instantiateFlow('flow');