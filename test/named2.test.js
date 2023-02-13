import { registerFlow, instantiateFlow } from '../ruleflow.js';

const nestedFlow = `
[filter "f" "in" "n => n%2 === 0" "out"] 
[map "m" "in" "n => n*2" "out"]

[link "f" "out" "m" "in"]
`;

const nestedFlow2 = `
[map "m2" "in" "n => n+200" "out"]
`;

registerFlow('nested', nestedFlow);
registerFlow('nested2', nestedFlow2);

const flow = `
[interval 1 1 4 "out"]
[ref 2 "nested"]
[ref 3 "nested2"]
[console 4 "in"]

[link 1 "out" 2 "in"]
[link 2 "out" 3 "in"]
[link 3 "out" 4 "in"]
`;

registerFlow('flow', flow);
instantiateFlow('flow');
