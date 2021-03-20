/* eslint-disable no-unused-expressions */
/* eslint-disable no-undef */
const { expect } = require('chai')
const {
  SAM, first, last, api, createInstance, doNotRender, utils: { E }, events
} = require('sam-pattern')

// Create a new SAM instance
const FSMTest = createInstance({ instanceName: 'FSMTest' })
const DualFSMTest = createInstance({ instanceName: 'DualFSMTest' })
const LocalFSMTest = createInstance({ instanceName: 'LocalFSMTest' })

const { fsm } = require('../dist/fsm')

let tick = () => ({ tick: true, tock: false })
let tock = () => ({ tock: true, tick: false })
let tack = async (done) => await new Promise(resolve => setTimeout(() => resolve({ tack: true, done }), 1000))
let clock 

describe('FSM tests', () => {
  before(() => {
    // fsm can be added as a component, in lax mode, several state 
    // machine components can be added independently

    // Instantiate fsm
    clock = fsm({
      pc0: 'TICKED',
      actions: {
        TICK: ['TICKED'],
        TOCK: ['TOCKED'],
        TACK: ['TACKED']
      },
      states: {
        TICKED: {
          transitions: ['TOCK', 'TACK'],
          naps: [{
            condition: ({ counter }) => counter > 0,
            nextAction: ({ done }) => done && done()
          }]
        },
        TOCKED: {
          transitions: ['TICK', 'TACK']
        },
        TACKED: {
          transtions: []
        }
      },
      deterministic: true,
      lax:false,
      enforceAllowedTransitions: true
    })

    const startState = clock.initialState({})

    // action action label to actions
    tick = clock.addAction(tick, 'TICK')
    tock = clock.addAction(tock, 'TOCK')
    tack = clock.addAction(tack, 'TACK')


    // add fsm to SAM instance
    const intents = FSMTest({
      initialState: startState,
      component: {
        actions: [
          tick,
          tock,
          tack
        ],
        acceptors: [
          ...clock.acceptors,
          model => ({ done }) => { model.done = done }
        ],
        reactors: clock.stateMachine
      },
      render: state => {
        if (state.__actionName === 'TICK') { 
          expect(state.pc).to.equal('TICKED') 
        } else {
          if (state.__actionName === 'TOCK') {
            expect(state.pc).to.equal('TOCKED')
          } else {
            expect(state.pc).to.equal('TACKED')
            state.done()
          }
        }
      }
    }).intents

    tick = intents[0]
    tock = intents[1]
    tack = intents[2]
  })

  describe('Initialization', () => {
    it('should create two intents', () => {
      expect(tick).to.exist
      expect(tock).to.exist
    })

    it('should tick and tock...', () => {
      tock()
      tick()
    })

    it('and tack (async action support)', (done) => {
      tack(done)
    })

    
  })

  describe('Unit tests', () => {
    it('should enforce transitions and return no error for a valid transition', () => {
      const sm = clock.stateMachine[0]
      const model = {
        pc: 'TICKED',
        pc_1: 'TOCKED',
        __actionName: 'TICK'
      }
      sm(model)()
      expect(model.__error).to.equal(undefined)
    })

    it('should enforce transitions and return an error for an invalid transition', () => {
      const sm = clock.stateMachine[0]
      const model = {
        pc: 'TICKED',
        pc_1: 'TOCKED',
        __actionName: 'TOCK'
      }
      sm(model)()
      expect(model.__error).to.equal('unexpected action TOCK for state: TICKED')
    })

    it('should handle the start state case', () => {
      const sm = clock.stateMachine[0]
      const model = {
        pc: 'TICKED',
      }
      sm(model)()
      expect(model.__error).to.equal(undefined)
    })

    it('should generate state specific next-action-predicates', (done) => {
      const nap = clock.naps
      expect(nap.length).to.equal(1)
      expect(nap[0]({ pc: 'TICKED', counter: 10, done })()).to.equal(false)
      expect(nap[0]({ pc: 'TICKED', counter: 0, done })()).to.equal(undefined)
    })

    it('should transform transitions into states and actions', () => {
      const transitions = [{
        from: 'state1', to: 'state2', on: 'ACTION'
      }]
      const { states, actions } = fsm.actionsAndStatesFor(transitions)
      expect(actions.ACTION[0]).to.equal('state2')
      expect(states.state1.transitions[0]).to.equal('ACTION')
      expect(states.state2.transitions.length).to.equal(0)
    })

    it('should transform the rocket launcher transitions into states and actions', () => {
      const transitions = [{
        from: 'ready', to: 'started', on: 'START'
      },{
        from: 'started', to: 'ticking', on: 'TICK'
      },{
        from: 'ticking', to: 'ticking', on: 'TICK'
      },{
        from: 'ticking', to: 'aborted', on: 'ABORT'
      },{
        from: 'ticking', to: 'launched', on: 'LAUNCH'
      },{
        from: 'aborted', to: 'ready', on: 'RESET'
      },{
        from: 'launched', to: 'ready', on: 'RESET'
      }]
      const { states, actions } = fsm.actionsAndStatesFor(transitions)
      expect(actions.RESET[0]).to.equal('ready')
      expect(states.ticking.transitions.length).to.equal(3)
      expect(states.launched.transitions[0]).to.equal('RESET')
    })

    it('should flatten transitions', () => {
      const sm = fsm.flattenTransitions({
        NONE: {
          MINE_PRESSED: "MINING"
        },
        MINING: {
          CANCEL_PRESSED: "NONE",
          MINE_CONFIRMED: "ACTIVE"
        },
        ACTIVE: {
          CLAIM_REWARDS_CONFIRMED: "ACTIVE",
          ADJUST_PRESSED: "ADJUSTING",
          UNMINE_CONFIRMED: "NONE"
        },
        ADJUSTING: {
          CANCEL_PRESSED: "ACTIVE",
          MINE_CONFIRMED: "ACTIVE",
          UNMINE_CONFIRMED: "NONE"
        }
      })
      expect(sm[0].from).to.equal('NONE')
      
    })
  }) 

  describe('Behavior', () => {
    it('should support two fsms running concurrently in the same SAM instance', () => {

      const clock1 = fsm({
        pc: 'status1',
        pc0: 'TICKED1',
        actions: {
          TICK1: ['TICKED1'],
          TOCK1: ['TOCKED1']
        },
        states: {
          TICKED1: {
            transitions: ['TOCK1'],
            naps: [{
              condition: ({ counter }) => counter > 0,
              nextAction: ({ done }) => done && done()
            }]
          },
          TOCKED1: {
            transitions: ['TICK1']
          }
        },
        deterministic: true,
        lax:false,
        enforceAllowedTransitions: true
      })

      const clock2 = fsm({
        pc: 'status2',
        pc0: 'TICKED2',
        actions: {
          TICK2: ['TICKED2'],
          TOCK2: ['TOCKED2']
        },
        states: {
          TICKED2: {
            transitions: ['TOCK2'],
            naps: [{
              condition: ({ counter }) => counter > 0,
              nextAction: ({ done }) => done && done()
            }]
          },
          TOCKED2: {
            transitions: ['TICK2']
          }
        },
        deterministic: true,
        lax:false,
        enforceAllowedTransitions: true
      })
      
      const startState = clock2.initialState(clock1.initialState({}))
  
      let tick1 = () => ({ tick: true, tock: false })
      let tock1 = () => ({ tock: true, tick: false })
      let tick2 = () => ({ tick: true, tock: false })
      let tock2 = () => ({ tock: true, tick: false })


      // action action label to actions
      tick1 = clock1.addAction(tick1, 'TICK1')
      tock1 = clock1.addAction(tock1, 'TOCK1')
      tick2 = clock2.addAction(tick2, 'TICK2')
      tock2 = clock2.addAction(tock2, 'TOCK2')
  
      // add fsm to SAM instance
      const intents = DualFSMTest({
        initialState: startState,
        component: {
          actions: [
            tick1,
            tock1,
            tick2,
            tock2
          ],
          acceptors: [
            ...clock1.acceptors,
            ...clock2.acceptors,
            model => ({ done }) => { model.done = done }
          ],
          reactors: [
            ...clock1.stateMachine,
            ...clock2.stateMachine
          ]
        },
        render: state => {
          if (state.__actionName === 'TICK1') { 
            expect(state.status1).to.equal('TICKED1') 
          } else {
            if (state.__actionName === 'TOCK1') {
              expect(state.status1).to.equal('TOCKED1')
            } 
          }
          if (state.__actionName === 'TICK2') { 
            expect(state.status2).to.equal('TICKED2') 
          } else {
            if (state.__actionName === 'TOCK2') {
              expect(state.status2).to.equal('TOCKED2')
            } 
          }
        }
      }).intents
  
      tick1 = intents[0]
      tock1 = intents[1]
      tick2 = intents[2]
      tock2 = intents[3]

      tock1()
      tock2()
      tick1()
      tick2()
    })

    it('should support localState in the SAM instance', () => {
      const clock = fsm({
        componentName: 'tester',
        pc: 'status',
        pc0: 'TICKED',
        actions: {
          TICK1: ['TICKED'],
          TOCK1: ['TOCKED']
        },
        states: {
          TICKED: {
            transitions: ['TOCK'],
            naps: [{
              condition: ({ counter }) => counter > 0,
              nextAction: ({ done }) => done && done()
            }]
          },
          TOCKED: {
            transitions: ['TICK']
          }
        },
        deterministic: true,
        lax:false,
        enforceAllowedTransitions: true
      })

      let tick = () => ({ tick: true, tock: false })
      let tock = () => ({ tock: true, tick: false })
      

       // add fsm to SAM instance
       const intents = LocalFSMTest({
        component: {
          name: 'tester',
          localState: clock.initialState({}),
          actions: [
            tick,
            tock
          ],
          acceptors: [
            ...clock.acceptors,
            model => ({ done }) => { model.done = done }
          ],
          reactors: [
            ...clock.stateMachine,
          ]
        },
        render: state => {
          if (state.__actionName === 'TICK') { 
            expect(state.localState('tester').status).to.equal('TICKED') 
          } else {
            if (state.__actionName === 'TOCK') {
              expect(state.localState('tester').status).to.equal('TOCKED')
            } 
          }
        }
      }).intents
  
      tick = intents[0]
      tock = intents[1]

      tock()
      tock()
    })
  })
})