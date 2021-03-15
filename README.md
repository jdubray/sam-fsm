# an FSM library 

sam-fsm is a companion libray to the [sam-pattern](https://www.npmjs.com/package/sam-pattern). It provides a simple finite state machine implementation on top of the SAM Pattern. `sam-fsm` supports deterministic and non deterministic state machines.

## Table of Contents
- [Installation](#installation)        
  - [Node.js](#nodejs)        
  - [Browsers](#browsers)        
  - [Getting started](#getting-started)           
- [Library](#library)        
  - [Constructors](#constructors)        
  - [Parameters](#parameters)        
  - [Exception Handling](#exception-handling)    
- [Code samples](#code-samples)        
- [Support](#support)   
- [Change Log](#change-log)    
- [Copyright and license](#copyright-and-license)

## Installation

### Node.js
The library is available on [npm](https://www.npmjs.com/package/sam-fsm). To install it, type:

```sh
$ npm install --save sam-fsm
```

```javascript
const { fsm } = require('sam-fsm')

const simpleFsm = fsm({
  pc0: 'START_STATE',
  actions: {
    DO_SOMETHING: ['END_STATE']
  },
  states: {
    START_STATE: {
      transitions: ['DO_SOMETHING']
    }
  },
  deterministic: true,
  enforceAllowedActions: true
})

```

### Browsers
You can also use it within the browser; install via npm and use the sam.js file found within the download. For example:

```html
<script src="./node_modules/sam-fsm/dist/fsm.js"></script>

// or

<script src="https://unpkg.com/sam-fsm"></script>
```

```javascript
const { SAM, step, match } = tp
const { fsm } = tpFSM

const simpleFsm = fsm({
  pc0: 'START_STATE',
  actions: {
    DO_SOMETHING: ['END_STATE']
  },
  states: {
    START_STATE: {
      transitions: ['DO_SOMETHING']
    }
  },
  deterministic: true,
  enforceAllowedActions: true
})

```

### Getting started

The FSM descriptor specifies:
- actions and their possible resuling states (more than one if not deterministic)
- states and their respective (allowed) actions to transition from
- the initial value of the state (`pc0`)
- whether the state machine is deterministic or not
- whether allowed transition need to be enforced

Deterministic FSMs will mutate the `pc` variable for you. Non deterministic FSMs expect that you will provide one or more acceptors that update the `pc` variable.

Please note that `pc` is used commonly in TLA+ as the control state variable and is itself in reference to [John Von Neumann's](https://en.wikipedia.org/wiki/Program_counter) `program counter` (also called `instruction pointer` in x86 architectures).

The `sam-fsm` library enables the overlaying of a regular SAM state machine making it easier to use FSM semantics when they make sense without compromising the robust structure of a TLA+ based state machine. Of course, `sam-fsm` also supports FSM only state machines, with an underlying SAM implementation. 

The descriptor support both action and event semantics:
```javascript
  actions: {
    CALL_API: ['called'],
    ON_SUCCESS: ['succeeded'],
    ON_ERROR: ['failed']
  },
  states: {
    called: {
      transitions: ['ON_SUCCESS', 'ON_ERROR']
    },
    succeeded: {
      transitions: ['...']
    },
    failed: {
      transitions: ['CALL_API']
    }
  }
```

Let's take a look at the example of a clock

```javascript
const {
  SAM, first, last, api, createInstance, doNotRender, utils: { E }, events
} = require('sam-pattern')

const { fsm } = require('sam-fsm')

// Regular SAM actions, returning a proposal to update the model
let tick = () => ({ tick: true, tock: false })
let tock = () => ({ tock: true, tick: false })

// Instantiate clock fsm
const clock = fsm({
  pc0: 'TOCKED',
  actions: {
    TICK: ['TICKED'],
    TOCK: ['TOCKED']
  },
  states: {
    TICKED: {
      transitions: ['TOCK']
    },
    TOCKED: {
      transitions: ['TICK']
    }
  },
  deterministic: true,
  enforceAllowedTransitions: true
})

// action action label to clock actions
tick = clock.addAction(tick, 'TICK')
tock = clock.addAction(tock, 'TOCK')


// Create a new SAM instance
const FSMTest = createInstance({ instanceName: 'FSMTest' })

// add fsm to SAM instance
const intents = FSMTest({
  initialState: clock.initialState({}),
  component: {
    actions: [
      tick,
      tock
    ],
    acceptors: clock.acceptors,
    reactors: clock.stateMachine
  },
  render: state => {
    console.log(state.pc)
  }
}).intents

tick = intents[0]
tock = intents[1]

tick()
tock()
```

Here is the new [Rocket Launcher example](https://codepen.io/sam-pattern/pen/XWNGNBy)

## Library

### Constructors
- `fsm`               : creates a new fsm instance 

### Parameters
- `pc0`                   : initial state 
- `actions`               : an object where the keys are the action labels and the values the array of possible resulting states (one state only for deterministic state machines)
- `states`                : an object where the keys are the state labels and the values are allowed transitions from the corresponding state (as an array of action lables)
- `deterministic`         : a boolean value, `true` if the FSM is deterministic
- `enforceAllowedActions` : a boolean value, when `true` the acceptors will validate that a valid action is used to transition away from a state
- `pc`                    : a string that is used to rename the `pc` variable, `{ pc: 'foo' }` will use `model.foo` as the control state variable.

### Integration with SAM

Start by creating a SAM instance as usual:
```
const SAMFSM = createInstance({ instanceName: 'SAMFSM' })
```

`sam-fsm` provides five integration points: `initialState`, `addAction`, `send`, `acceptors` and the `stateMachine` reactor.

Assuming your fsm as the `sam-fsm` instance name:

```javascript
const intents = SAMFSM({
      initialState: fsm.initialState(yourInitialState),
      component: {
        actions: [
          action1, // a sam action, unrelated to the sam-fsm instance
          action2, // another regular sam action
          fsm.addAction(action3, 'ACTION3') // a sam-fsm action
          fsm.send('ACTION4') // creates an action that triggers ACTION4
        ],
        acceptors: [
          ...fsm.acceptors, // the control state acceptors
          acceptor1, // 
          acceptor2
        ],
        reactors: [
          ...fsm.stateMachine, // the sam-fsm 
          reactor1,  // a sam reactor, unrelated to the sam-fsm instance
          reactor2   // another regular reactor
        ]
      },
      render: state => { console.log(state) }
      })
```

FSM methods:

`initialState`    : wraps the SAM instance's intial state with the FSM internal variables (such as `pc`)

`addAction`       : wraps regular SAM actions 
`send`            : can be used when the action is trivial and only needs to pass its label value as a proposal

`acceptors`       : returns the fsm acceptors (as an array)

`stateMachine`    : returns the fsm reactor (as an array of 1 element)

From that point, everything else is similar to a regular SAM instance. 

`sam-fsm` does not yet support component local state. However you can have more than one fsm defined, as long as you use a different `pc` variable.

## Exception Handling

Exceptions are reported as SAM exceptions which can be accessed via these four SAM methods:
- `hasError`  
- `error`
- `errorMessage`
- `clearError`

For instance:

```javascript
render: (state) => {
  if (state.hasError()) {
    console.log(state.errorMessage())
    state.clearError()
  } 
}
```

## Code samples

[Rocket Launcher](https://codepen.io/sam-pattern/pen/XWNGNBy)

Please [the unit tests](https://github.com/jdubray/sam-fsm/tree/master/test) for more code samples

## Support

Please post your questions/comments on the [SAM-pattern forum](https://gitter.im/jdubray/sam)

## Change Log
- 0.8.9   Ready for community review

## Copyright and license
Code and documentation copyright 2021 Jean-Jacques Dubray. Code released under the ISC license. Docs released under Creative Commons.