import { registerFlow, instantiateFlow } from '../ruleflow.js';

const flow = `
[interval 1 1 4 "out"]
[interval 2 5 8 "out"]
[map 3 "in" "n => n*10" "out"]
[console "console 1" "in"]
[console "console 2" "in"]

[link 1 "out" 3 "in"]
[link 2 "out" 3 "in"]
[link 3 "out" "console 1" "in"]
[link 3 "out" "console 2" "in"]
`;

registerFlow('flow', flow);
instantiateFlow('flow');