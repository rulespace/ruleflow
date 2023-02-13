import { Sets, compileToConstructor } from './deps.ts';
import specification from './ruleflow-rsp.js'; 

// terminology:
// data: tuple or fact
// fact: ground atom, so a predicate with list of values (from the 'relational' domain)
// tuple: list of values (from the 'data' domain)

export {registerFlow, instantiateFlow };

async function* IntervalSource(low, high, outPort)
{
  yield; 
  for (let n = low; n <= high; n++)
  {
    yield [[outPort, n]];
  }
}

// in: name not important, so not a param
async function* MapOperator(f, outPort)
{
  let input = yield; 
  while (true) 
  {
    input = yield input.map(([_in, n]) => [outPort, f(n)]);
  }
}

async function* FilterOperator(f, outPort)
{
  let input = yield; 
  while (true) 
  {
    const output = input.flatMap(([_in, n]) => f(n) ? [[outPort, n]] : []); 
    input = yield output.length === 0 ? undefined : output;
  }
}

// in: add, remove; out: added, removed
async function* RulesOperator(src)
{
  const ctr = compileToConstructor(src);
  const instance = ctr();
  let input = yield;
  do
  {
    const add = new Map();
    const remove = new Map();
    for (const [inPort, fact] of input)
    {
      const factCtr = instance[fact[0]];
      const instanceFact = new factCtr(...fact.slice(1));
      if (inPort === 'add')
      {
        add.set(factCtr, add.has(factCtr) ? add.get(factCtr).push(instanceFact) : [instanceFact]);
      }
      else if (inPort === 'remove')
      {
        remove.set(factCtr, remove.has(factCtr) ? remove.get(factCtr).push(instanceFact) : [instanceFact]);
      }
      else
      {
        throw new Error(`cannot handle input port ${inPort}`);
      }
    }
    const delta = instance.computeDelta(add, remove);
    const allAdded = [...delta.added().values()].flat();
    const allAdd = [...add.values()].flat().map(t => instance.getTuple(t));
    const addedNoAdd = [...Sets.difference(allAdded, allAdd)].map(f => ['added', [f.name(), ...f.values()]]);;
    const allRemoved = [...delta.removed().values()].flat();
    const allRemove = [...remove.values()].flat();
    const removedNoRemove = [...Sets.difference(allRemoved, allRemove)].map(f => ['removed', [f.name(), ...f.values()]]);;
    input = yield removedNoRemove.concat(addedNoAdd);
  }
  while (true);      
}

// name inPort not important
async function* ConsoleSink(name)
{
  while (true)
  {
    for (const [_in, n] of yield)
    {
      console.log(`${name}: ${n}`);
    }
  }
}

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
  asyncGenFun;
  inPorts;
  outPorts;

  constructor(name, asyncGenFun, inPorts, outPorts)
  {
    this.name = name;
    this.asyncGenFun = asyncGenFun;
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

  async instantiate() // only expanded flows (so no refs)
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
            const ag = operator.asyncGenFun();
            return ag;
          }
          throw new Error(`cannot instantiate operator ${operator}`);
        });
      return ags;
    }

    const generators = generateGenerators(operators);    //
    const statusDone = generators.map(_ => false);
    // init step: move to first yield
    const initResult = await Promise.all(generators.map(generator => generator.next()));
    initResult.forEach(({value:_, done}, i) => 
      {
        if (done)
        {
          // it's really "bad form" when a flow operator cannot complete it's init
          // so maybe this should be an error instead?
          terminate(i);
        }
      });
    
    function terminate(i)
    {
      console.log(`terminating ${i}`);
      if (statusDone[i] === true)
      {
        throw new Error('internal error: resumed a generator that was done');
      }
      statusDone[i] = true;
      // check predecessors: if all outputs of predecessor are done, then transitively terminate
      for (const [_inPort, from, _outPort] of inputs[i])
      {
        checkTerminationUpstream(from);
      }
      // check successors: if all inputs of successor are done, then transitively terminate
      for (const [_outPort, to, _inPort] of outputs[i])
      {
        checkTerminationDownstream(to);
      }
    }

    function terminateDownstream(i)
    {
      console.log(`terminating (downstream) ${i}`);
      if (statusDone[i] === true)
      {
        throw new Error('internal error: resumed a generator that was done');
      }
      statusDone[i] = true;
      // check successors: if all inputs of successor are done, then transitively terminate
      for (const [_outPort, to, _inPort] of outputs[i])
      {
        checkTerminationDownstream(to);
      }
    }

    function terminateUpstream(i)
    {
      console.log(`terminating (upstream) ${i}`);
      if (statusDone[i] === true)
      {
        throw new Error('internal error: resumed a generator that was done');
      }
      statusDone[i] = true;
      // check predecessors: if all outputs of predecessor are done, then transitively terminate
      for (const [_inPort, from, _outPort] of inputs[i])
      {
        checkTerminationUpstream(from);
      }
    }
  
    function checkTerminationDownstream(i)
    {
      for (const [_inPort, from, _outPort] of inputs[i])
      {
        if (!statusDone[from])
        {
          return;
        }
      }
      terminateDownstream(i);
    }

    function checkTerminationUpstream(i)
    {
      for (const [_outPort, to, _inPort] of outputs[i])
      {
        if (!statusDone[to])
        {
          return;
        }
      }
      terminateUpstream(i);
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

      const loop = async (i, active) =>
      {
        // console.log(`loop ${i} active ${active}`);
        while (i < generators.length && statusDone[i])
        {
          i++;
        }
        if (i === generators.length)
        {
          if (active)
          {
            propagate();
            return;  
          }
          else
          {
            console.log("propagation finished");
            return;
          }
        }
        // console.log(`operator ${i}: input ${inputValues[i]?.join(" ")}`);
        const ag = generators[i];
        const {value:yieldedValue, done} = await ag.next(inputValues[i]);
        // console.log(`operator ${i}: output ${yieldedValue?.join(" ")} (${done ? "done" : "not done"})}`);
        if (done)
        {
          terminate(i);
          loop(i+1, active);
        }
        else
        {
          if (yieldedValue !== undefined)
          {
            for (const [outPort, outputValue] of yieldedValue)
            {
              let deliveries = 0;
              for (const [outP, to, inPort] of outputs[i])
              {
                if (outP === outPort)
                {
                  console.log(`${i}/${outPort} => ${to}/${inPort}: ${outputValue}`);
                  inputValues[to].push([inPort, outputValue]);    
                  deliveries++;
                }
              }
              if (deliveries === 0)
              {
                throw new Error(`cannot deliver value from operator ${i} on output port '${outPort}' (no known destinations)`)
              }
            }  
          }
          loop(i+1, true);
        }
      }
     loop(0, false);
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
  
  for (const t of instance.tuples().filter(t => t.name() === 'interval'))
  {
    const [name, low, high, outPort] = t.values();
    operators.set(name, new FlowOperator(name, () => IntervalSource(low, high, outPort), [], [outPort]));
  }

  for (const t of instance.tuples().filter(t => t.name() === 'map'))
  {
    const [name, inPort, f, outPort] = t.values();
    const fCtr = new Function(`return ${f}`);
    operators.set(name, new FlowOperator(name, () => MapOperator(fCtr(), outPort), [inPort], [outPort]));
  }

  for (const t of instance.tuples().filter(t => t.name() === 'filter'))
  {
    const [name, inPort, f, outPort] = t.values();
    const fCtr = new Function(`return ${f}`);
    operators.set(name, new FlowOperator(name, () => FilterOperator(fCtr(), outPort), [inPort], [outPort]));
  }

  for (const t of instance.tuples().filter(t => t.name() === 'rules'))
  {
    const [name, src] = t.values();
    operators.set(name, new FlowOperator(name, () => RulesOperator(src), ['add', 'remove'], ['added', 'removed']));
  }

  for (const t of instance.tuples().filter(t => t.name() === 'console'))
  {
    const [name, inPort] = t.values();
    operators.set(name, new FlowOperator(name, () => ConsoleSink(name), [inPort], []));
  }

  for (const t of instance.tuples().filter(t => t.name() === 'javascript'))
  {
    const AsyncGeneratorFunction = async function* () {}.constructor;
    const [name, src] = t.values();
    operators.set(name, new FlowOperator(name, new AsyncGeneratorFunction(src), [], []));
  }

  for (const t of instance.tuples().filter(t => t.name() === 'ref'))
  {
    const [name, ref] = t.values();
    operators.set(name, new RefOperator(name, ref, [], []));
  }

  for (const t of instance.tuples().filter(t => t.name() === 'rand'))
  {
    const [name, inPort] = t.values();
    operators.get(name).inPorts.push(inPort);
  }

  for (const t of instance.tuples().filter(t => t.name() === 'ret'))
  {
    const [name, outPort] = t.values();
    operators.get(name).outPorts.push(outPort);
  }

  for (const t of instance.tuples().filter(t => t.name() === 'link'))
  {
    const [from, outPort, to, inPort] = t.values();
    links.push([[from, outPort], [to, inPort]]);
  }

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
