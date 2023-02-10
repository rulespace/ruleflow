import { compileToConstructor } from './deps.ts';

export {registerFlow, instantiateFlow };

const AsyncGeneratorFunction = async function* () {}.constructor;

const specification = `

; terminology:
; data: tuple or fact
; fact: ground atom, so a predicate with list of values (from the 'relational' domain)
; tuple: list of values (from the 'data' domain)

(relation [rator name lambda]) ; numbered ports, data in/out
(relation [ref name ref]) ; composition

(relation [rand operator port]) ; in_port
(relation [ret operator port]) ; out_port

(relation [link from out_port to in_port])

(rule [map name in_port f out_port] [rator name ])

;(rule [connected_input to in_port] [link _ _ to in_port])
;(rule [connected_output from out_port] [link from out_port _ _])
;(rule [open_input operator in_port] [rand operator in_port] (not [connected_input operator in_port]))
;(rule [open_output operator out_port] [ret operator out_port] (not [connected_output operator out_port]))

`;

// copied from rulespace/analyzer.js
function topoSort(operators)
{

  const sccs = [];

  let index = 0;
  const S = [];

  for (const v of operators)
  {
    if (v.index === undefined)
    {
      strongconnect(v);
    }
  } 

  function strongconnect(v)
  {
    v.index = index;
    v.lowlink = index;
    index++;
    S.push(v);
    v.onStack = true;

    for (const w of v.precedes)
    {
      if (w.index === undefined)
      {
        strongconnect(w);
        v.lowlink = Math.min(v.lowlink, w.lowlink);
      }
      else if (w.onStack)
      {
        v.lowlink = Math.min(v.lowlink, w.index);
      }
    }
    
    if (v.lowlink === v.index)
    {
      const scc = [];
      let w;
      do
      {
        w = S.pop();
        w.onStack = false;
        scc.push(w);
      }
      while (w !== v)
      sccs.push(scc);
    }
  }
  const rsccs = sccs.reverse();
  return rsccs;
}

//// description

class FlowOperator
{
  name;
  lam;
  inPorts;
  outPorts;

  constructor(name, lam, inPorts, outPorts)
  {
    this.name = name;
    this.lam = lam;
    this.inPorts = inPorts;
    this.outPorts = outPorts;
  }

  toString()
  {
    return `[rator '${this.name}']`;
  }

}

class RefOperator
{
  name;
  ref;
  inPorts;
  outPorts;

  constructor(name, ref, inPorts, outPorts)
  {
    this.name = name;
    this.ref = ref;
    this.inPorts = inPorts;
    this.outPorts = outPorts;
  }

  toString()
  {
    return `[ref '${this.name}']`;
  }
}

// link: [[fromOperator, outPort], [toOperator, inPort]]

class Flow
{
  #toporators;
  #links;

  #openInputs = [];
  #openOutputs = [];

  constructor(toporators, links)
  {
    this.#toporators = toporators;
    this.#links = links;

    for (const operator of toporators)
    {
      for (const inPort of operator.inPorts)
      {
        if (this.source(operator, inPort) === null)
        {
          this.#openInputs.push([operator, inPort]);
          console.log(`open input ${operator} '${inPort}'`);
        }
      }
      for (const outPort of operator.outPorts)
      {
        if (this.destination(operator, outPort) === null)
        {
          this.#openOutputs.push([operator, outPort]);
          console.log(`open output ${operator} '${outPort}'`);
        }
      }
    }
  }

  operators()
  {
    return this.#toporators;
  }

  source(operator, inPort)
  {
    for (const [from, [toOperator, inP]] of this.#links)
    {
      if (toOperator === operator && inP === inPort)
      {
        return from;
      }
    }
    return null;
  }

  destination(operator, outPort)
  {
    for (const [[fromOperator, outP], to] of this.#links)
    {
      if (fromOperator === operator && outP === outPort)
      {
        return to;
      }
    }
    return null;
  }

  openInput(inPort)
  {
    for (const [operator, inP] of this.#openInputs)
    {
      if (inP === inPort)
      {
        return operator;
      }
    }
    return null;
  }

  openOutput(outPort)
  {
    for (const [operator, outP] of this.#openOutputs)
    {
      if (outP === outPort)
      {
        return operator;
      }
    }
    return null;
  }

  expand(flows)
  {

    function expandRefOperator(operator)
    {
      const nestedFlow = flows.get(operator.ref);
      if (nestedFlow === undefined)
      {
        throw new Error(`reference to undefined flow ${operator.ref}`);
      }
      const expandedNestedFlow = nestedFlow.expand(flows);
      return expandedNestedFlow;
    }

    const operators = this.operators();
    const links = this.#links;
    const ref2expandedFlow = new Map();
    const newOperators = operators.flatMap((operator) =>
      {
        if (operator instanceof RefOperator)
        {
          const expandedFlow = expandRefOperator(operator);
          ref2expandedFlow.set(operator, expandedFlow);
          return expandedFlow.operators();
        }
        return [operator];
      });

    const newLinks = links.map(([[fromOperator, outPort], [toOperator, inPort]]) =>
      {
        if (fromOperator instanceof RefOperator)
        {
          const fromFlow = ref2expandedFlow.get(fromOperator);
          const fromOperatorInExpansion = fromFlow.openOutput(outPort);
          if (toOperator instanceof RefOperator)
          {
            const toFlow = ref2expandedFlow.get(toOperator);
            const toOperatorInExpansion = toFlow.openInput(inPort);
            return [[fromOperatorInExpansion, outPort], [toOperatorInExpansion, inPort]];
          }
          else
          {
            return [[fromOperatorInExpansion, outPort], [toOperator, inPort]];
          }
        }
        else if (toOperator instanceof RefOperator)
        {
          const toFlow = ref2expandedFlow.get(toOperator);
          const toOperatorInExpansion = toFlow.openInput(inPort);
          return [[fromOperator, outPort], [toOperatorInExpansion, inPort]];
        }
        else
        {
          return [[fromOperator, outPort],[toOperator, inPort]];
        }  
      });

    return new Flow(newOperators, newLinks);
  }

  instantiate() // only expanded flows (so no refs)
  {
    const operators = this.#toporators;
    const links = this.#links;

    const inputs = operators.map(_ => []);
    const outputs = operators.map(_ => []);    
    for (const [[from, outPort], [to, inPort]] of links)
    {
      const fromIndex = operators.indexOf(from);
      const toIndex = operators.indexOf(to);
      console.log(`linking ${from}/'${outPort}' -> ${to}/'${inPort}'`);
      inputs[toIndex].push([inPort, fromIndex, outPort]);
      outputs[fromIndex].push([outPort, toIndex, inPort]);
    }

    function generateGenerators(operators)
    {
      // flat: we lose scc info, but that only occurs in recursive flows (which we now do not (cannot) support)
      const ags = operators.map(operator =>
        {
          if (operator instanceof FlowOperator)
          {
            const ag = new AsyncGeneratorFunction(operator.lam)();
            return ag;
          }
          throw new Error(`cannot handle operator ${operator}`);
        });
      return ags;
    }

    const generators = generateGenerators(operators);
    // init step: move to first yield
    generators.forEach(generator => generator.next());

    //
    const statusDone = generators.map(_ => false);

    function terminate(i)
    {
      console.log(`terminating ${i}`);
      if (statusDone[i] === true)
      {
        throw new Error('internal error: resumed a generator that was done');
      }
      statusDone[i] === true;
      // check successors: if all inputs of successor are done, then transitively terminate
      for (const [_outPort, to, _inPort] of outputs[i])
      {
        checkTermination(to);
      }
    }

    function checkTermination(i)
    {
      let inputAlive = false;
      for (const [_inPort, from, _outPort] of inputs[i])
      {
        inputAlive &= !statusDone[from]; // TODO break when alive
      }
      if (!inputAlive)
      {
        terminate(i);
      }
    }

    let propagationCounter = 0;
    const propagate = () =>
    {
      console.log(`\npropagation ${++propagationCounter}`)
      // if (++propagationCounter > 1000)
      // {
      //   console.log("debugging: bailing...");
      //   return;
      // }
      const inputValues = generators.map(_ => []);

      const loop = i =>
      {
        if (i === generators.length)
        {
          propagate();
          return;
        }
        console.log(`operator ${i}: input ${inputValues[i]?.join(" ")}`);
        const ag = generators[i];
        const p = ag.next(inputValues[i]);
        p.then(result =>
          {
            const {value:yieldedValue, done} = result;
            console.log(`operator ${i}: output ${yieldedValue?.join(" ")} (${done ? "done" : "not done"})}`);
            if (done)
            {
              terminate(i);
            }
            else
            {
              if (yieldedValue !== undefined)
              {
                outer: for (const [outPort, outputValue] of yieldedValue)
                {
                for (const [outP, to, inPort] of outputs[i])
                  {
                    if (outP === outPort)
                    {
                      console.log(`${i}/${outPort} => ${to}/${inPort}: ${outputValue}`);
                      inputValues[to].push([inPort, outputValue]);    
                      continue outer;
                    }
                  }
                  throw new Error(`cannot deliver value from operator ${i} on output port '${outPort}' (unknown destination)`)
                }  
              }
              loop(i+1);
            }
          });
      }
      loop(0);
    }
    propagate();
  }

  toString()
  {
    let sb = "[flow\n";

    this.operators().forEach((operator, i) =>
    {
      sb += i + " : " + operator + "\n";
    });

    sb += "links ";
    sb += this.#links.join(' ');
    sb += '\n';

    sb += "]";
    return sb;
  }
}

function compileFlow(program)
{
  const operators = new Map();
  const links = [];
  // const openInputs = [];
  // const openOutputs = [];

  const ctr = compileToConstructor(specification + program);
  const instance = ctr();
  
  for (const t of instance.tuples().filter(t => t.name() === 'rator'))
  {
    operators.set(t.t0, new FlowOperator(t.t0, t.t1, [], []));
  }

  for (const t of instance.tuples().filter(t => t.name() === 'ref'))
  {
    operators.set(t.t0, new RefOperator(t.t0, t.t1, [], []));
  }

  for (const t of instance.tuples().filter(t => t.name() === 'rand'))
  {
    const operator = operators.get(t.t0);
    operator.inPorts.push(t.t1);
  }

  for (const t of instance.tuples().filter(t => t.name() === 'ret'))
  {
    const operator = operators.get(t.t0);
    operator.outPorts.push(t.t1);
  }

  for (const t of instance.tuples().filter(t => t.name() === 'link'))
  {
    // const from = operators.get(t.t0);
    // const outPort = t.t1;
    // const to = operators.get(t.t2);
    // const inPort = t.t3;
    links.push([[t.t0, t.t1], [t.t2, t.t3]]);
  }

  // for (const t of instance.tuples().filter(t => t.name() === 'open_input'))
  // {
  //   const to = operators.get(t.t0);
  //   const inPort = t.t1;
  //   openInputs.push([to, inPort]);
  //   console.log(`open input ${to} '${inPort}'`);
  // }

  // for (const t of instance.tuples().filter(t => t.name() === 'open_output'))
  // {
  //   const from = operators.get(t.t0);
  //   const outPort = t.t1;
  //   openOutputs.push([from, outPort]);
  //   console.log(`open output ${from} '${outPort}'`);
  // }

  // compute precedence relation 
  for (const operator of operators.values())
  {
    operator.precedes = new Set();
  }

  for (const [[from, _outPort], [to, _inPort]] of links)
  {
    const fromOperator = operators.get(from);
    const toOperator = operators.get(to);
    fromOperator.precedes.add(toOperator);
  }
  // topologically sort
  const toporators = topoSort(operators.values()).flat();

  // go from names to operator objects
  const resolvedLinks = [];
  for (const [[from, outPort], [to, inPort]] of links)
  {
    resolvedLinks.push([[operators.get(from), outPort], [operators.get(to), inPort]]);
  }

  return new Flow(toporators, resolvedLinks);
}


const flows = new Map();

function registerFlow(name, flowSpec)
{
  flows.set(name, compileFlow(flowSpec));
}

function instantiateFlow(name)
{
  const unexpanded = flows.get(name);
  console.log(`unexpanded: ${unexpanded}`);
  const expanded = unexpanded.expand(flows);
  console.log(`expanded: ${expanded}`);
  expanded.instantiate();
}
