import { registerFlow, instantiateFlow } from '../ruleflow.js';

const nestedFlow = `
[filter "f" "in" "n => n%2 === 0" "out"] 
[map "m" "in" "n => n*2" "out"]

[link "f" "out" "m" "in"]
`;

registerFlow('nested', nestedFlow);

const flow = `
[interval 1 1 4 "out"]
[ref 2 "nested"]
[console 3 "in"]

[link 1 "out" 2 "in"]
[link 2 "out" 3 "in"]
`;

registerFlow('flow', flow);
instantiateFlow('flow');
