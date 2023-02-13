import { registerFlow, instantiateFlow } from '../ruleflow.js';

const nestedFlow = `
[map 0 "in" "n => n+1" "out"]
[map 1 "in" "n => n+2" "out"]

[link 0 "out" 1 "in"]
`;

registerFlow('nested', nestedFlow);

const flow = `
[interval 2 1 4 "out"]
[ref 3 "nested"]
[ref 4 "nested"]
[console 5 "in"]

[link 2 "out" 3 "in"]
[link 3 "out" 4 "in"]
[link 4 "out" 5 "in"]
`;

registerFlow('flow', flow);
instantiateFlow('flow');
