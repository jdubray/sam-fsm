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
        TACK: ['TACKED'],
        TEST: []
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
      enforceAllowedTransitions: true,
      blockUnexpectedActions: true
    })

    const startState = clock.initialState({})

    // add fsm to SAM instance
    const intents = FSMTest({
      initialState: startState,
      component: {
        actions: [
          clock.addAction(tick, 'TICK'),
          clock.addAction(tock, 'TOCK'),
          clock.addAction(tack, 'TACK')
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
            if (state.__actionName === 'TACK') {
              expect(state.pc).to.equal('TACKED')
              state.done()
            }
          }
        }
        // expect(state.hasError()).to.equal(false)
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

    it('should not tick a second time', () => {
      tick()
    })

    it('but it should tack (async action support)', (done) => {
      tack(done)
    })

    it('should wrap actions', () => {
      const myAction = clock.addAction(() => ({ test: true }), 'TEST')
      const proposal = myAction()
      proposal.then(({ test, __actionName }) => expect(test).to.equal(true) 
                                                && expect(__actionName).to.equal('TEST')
                                                )
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
  
      // add fsm to SAM instance
      const [tick1, tock1, tick2, tock2] = DualFSMTest({
        initialState: startState,
        component: {
          actions: [
            clock1.addAction(() => ({ tick: true, tock: false }), 'TICK1'),
            clock1.addAction(() => ({ tock: true, tick: false }), 'TOCK1'),
            clock2.addAction(() => ({ tick: true, tock: false }), 'TICK2'),
            clock2.addAction(() => ({ tock: true, tick: false }), 'TOCK2')
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
          TICK: ['TICKED'],
          TOCK: ['TOCKED']
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

       // add fsm to SAM instance
       const [tick, tock] = LocalFSMTest({
        component: {
          name: 'tester',
          localState: clock.initialState({}),
          actions: [
            clock.addAction(() => ({ tick: true, tock: false }), 'TICK'),
            clock.addAction(() => ({ tock: true, tick: false }), 'TOCK')
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
  
      tock()
      tock()
    })

    it('should not need a SAM instance, just the SAM pattern', () => {

      const clock = fsm({
        pc: 'status',
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
        lax:false,
        enforceAllowedTransitions: true
      })

      let model = clock.initialState({
        counter: 0
      })

      const acceptors = clock.acceptors.map(acceptor => acceptor(model))
      const reactors = clock.stateMachine.map(reactor => reactor(model))

      let actions = {
        tick: clock.addAction(() => ({tick: true, tock: false, incrementBy: 1 }), 'TICK'),
        tock: clock.addAction(() => ({tock: true, tick: false, incrementBy: 1 }), 'TOCK')
      }
      
      const accept = model => function(proposal) {
        model.counter += proposal.incrementBy > 0 ? proposal.incrementBy : 0
        acceptors.map(acceptor => acceptor(proposal))
        reactors.map(reactor => reactor(proposal))
        const nap = state.nap(model)
        if (!nap) {
          state.render(model)
        }
      }
      
      let state = {
        render(model) {
          if (model.__actionName === 'TICK') { 
            expect(model.status).to.equal('TICKED') 
          } else {
            if (model.__actionName === 'TOCK') {
              expect(model.counter).to.be.greaterThan(0)
              expect(model.status).to.equal('TOCKED')
            } 
          }
        }, 
        
        nap(model) {
          return false
        }
      }

      actions.tick().then(proposal => accept(model)(proposal))
      actions.tock().then(proposal => accept(model)(proposal))
    })
  })
})