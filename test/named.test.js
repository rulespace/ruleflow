import { registerFlow, instantiateFlow } from '../ruleflow.js';

const doubleFlow = `
[map "double" "in" "n => n*2" "out"]
`;

registerFlow('double', doubleFlow);

const flow = `
[interval 1 1 4 "out"]
[ref 2 "double"]
[console 3 "in"]

[link 1 "out" 2 "in"]
[link 2 "out" 3 "in"]
`;

registerFlow('flow', flow);
instantiateFlow('flow');
