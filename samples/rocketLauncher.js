const { SAM, step, match } = tp
const { fsm } = tpFSM

// next-action for ticking and started states
let _tick
let _launch

const countDownNAP = [{
        condition: ({ counter }) => counter > 0,
        nextAction: (state) => setTimeout(_tick, 1000)
      },
      {
        condition: ({ counter }) => counter === 0,
        nextAction: (state) => setTimeout(_launch, 100)
      }]

const rocketLauncher = fsm({
  pc0: 'ready',
  actions: {
    START: ['started'],
    TICK: ['ticking'],
    LAUNCH: ['launching'],
    ABORT: ['aborted'],
    RESET: ['ready']
  },
  states: {
    ready: {
      transitions: ['START']
    },
    started: {
      transitions: ['TICK', 'ABORT'],
      naps: countDownNAP
    },
    ticking: {
      transitions: ['TICK','LAUNCH','ABORT'],
      naps: countDownNAP
    },
    launching: {
      transitions: ['RESET']
    },
    aborted: {
      transitions: ['RESET']
    }
  },
  deterministic: true,
  enforceAllowedTransitions: true
})

const counting = ({ pc }) => { 
  return ['started', 'ticking'].includes(pc) 
}

const done = ({ pc }) => { 
  return ['aborted', 'launching'].includes(pc) 
}

SAM({
  initialState: rocketLauncher.initialState({
      counter: 10
    })
}) 

// Acceptors

const resetAcceptor = model => ({ reset }) => {
  if (reset) {
      model.counter = 10
  }
}

const countDown = model => ({ decBy }) => {
  if (decBy) {
    if (counting(model) && model.counter >= decBy) {
      model.counter -= decBy
    }
  }
}


// Reactors
const currentActionUpdate = model => () => {
  const currentState = model.pc
  model.currentAction = match(
    [
      counting(model), 
      done(model), 
      true
    ],
    ['abort', 'reset', 'start']
  )
}

const { intents } = SAM({
    component: { 
      actions: [
        // Actions are trivial in this example.
        // In general there is more work to do to  
        // create a proposal
        step,
        rocketLauncher.addAction(() => ({ }), 'START'),
        rocketLauncher.addAction(() => ({ }), 'LAUNCH'),
        rocketLauncher.addAction(() => ({ }), 'ABORT'),
        rocketLauncher.addAction(() => ({ reset: true }), 'RESET'),
        rocketLauncher.addAction(() => ({ decBy: 1 }), 'TICK')
      ], 
      acceptors: [
          ...rocketLauncher.acceptors,
          resetAcceptor,
          countDown
      ], 
      reactors: [
        ...rocketLauncher.stateMachine,
        currentActionUpdate
      ],
      naps: [
          ...rocketLauncher.naps
      ]
    }
  })

  let [
    init,
    start,
    launch,
    abort,
    reset,
    tick
  ] = intents

_tick = tick
_launch = launch

SAM({
    render: (state) => {
      if (state.hasError()) {
        console.log(state.__error)
        state.clearError()
      } 
      
      const stateRepresentation =  counting(state) ? state.counter : state.pc
      document.getElementById('app').innerHTML = `
        <p>Status: ${stateRepresentation}</p>
        <button onclick="javascript: ${state.currentAction}(); return false;">
          ${state.currentAction}
        </button>`
    }
  }) 

init()