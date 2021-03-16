/* eslint-disable no-unused-expressions */
/* eslint-disable no-undef */
const { expect } = require('chai')
const {
  SAM, first, last, api, createInstance, doNotRender, utils: { E }, events
} = require('sam-pattern')

// Create a new SAM instance
const FSMTest = createInstance({ instanceName: 'FSMTest' })

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
          transitions: ['TOCK', 'TACK']
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
        if (state.__fsmActionName === 'TICK') { 
          expect(state.pc).to.equal('TICKED') 
        } else {
          if (state.__fsmActionName === 'TOCK') {
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
        __fsmActionName: 'TICK'
      }
      sm(model)()
      expect(model.__error).to.equal(undefined)
    })

    it('should enforce transitions and return an error for an invalid transition', () => {
      const sm = clock.stateMachine[0]
      const model = {
        pc: 'TICKED',
        pc_1: 'TOCKED',
        __fsmActionName: 'TOCK'
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
  }) 
})