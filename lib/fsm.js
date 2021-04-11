// ISC License (ISC)
// Copyright 2021 Jean-Jacques Dubray

// Permission to use, copy, modify, and/or distribute this software for any purpose
// with or without fee is hereby granted, provided that the above copyright notice
// and this permission notice appear in all copies.

// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
// REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
// FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT,
// OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA
// OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
// ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

function checkAction(actions, action) {
    const actionLabels = Object.keys(actions)
    return actionLabels.includes(action)
}

const pushAction = (s, a) => {
    s.push(a)
    return s
}

const actionsAndStatesFor = (transitions) => ({
    pc0: transitions[0].from,
    states: transitions.reduce( (s, t) => Object.assign(s, { 
        [t.from]: { 
            transitions: s[t.from] && s[t.from].transitions && s[t.from].transitions[0] 
                ? pushAction(s[t.from].transitions, t.on) 
                : [t.on] 
        }, 
        [t.to]: s[t.to] && s[t.to].transitions[0] 
            ? s[t.to] 
            : { transitions: t.to === t.from ? [t.on] : [] }}), {}),
    actions: transitions.reduce( (a, t) => Object.assign(a, { [t.on]: [t.to] }), {}),
    deterministic: true,
    enforceAllowedTransitions: true
})

const flattenTransitions = (transitions) => Object.keys(transitions).reduce((ft, t) => {
    const state = transitions[t]
    const actions = Object.keys(state)
    return ft.concat(actions.map(a => ({ from: t, to: state[a], on: a })))
}, [])

function addAction(actions, id) {
    const localId = id
    return function(intent, action) {
        if (checkAction(actions, action) && intent) {
            const wrapped = async function() {
                const proposal = await intent.apply(this, arguments)
                proposal.__actionName = action
                proposal.__stateMachineId = localId
                return proposal
            }
                
            wrapped.__actionName = action
            wrapped.__stateMachineId = localId
            return wrapped
        }
        throw new Error(`addAction invalid action: ${action}`)
    }
}

const modelGetValue = (model, componentName, key  = 'pc') => 
    componentName 
        ? typeof model.localState === 'function'
            ? model.localState(componentName)[key]
            : model.__components 
                ? model.__components[componentName][key]
                : undefined
        : model[key]

const modelSetValue = (model, componentName, key, value) => {
    if (componentName) {
        if (typeof model.localState === 'function') {
            model.localState(componentName)[key] = value;
        } else {
            model.__components = { [componentName]: { [key]: value }}
        }
    } else {
        model[key] = value
    }
    return value
}

function stateMachineReactor({ pc0, actions, transitions, states, composite, pc = 'pc', id, componentName, deterministic = false, lax = true, enforceAllowedTransitions = false, blockUnexpectedActions = false }) {
    const specification = getStatesFrom(states, transitions)
    const stateLabels = Object.keys(specification.states)
    const smr = [
        model => () => {
            const previousState = modelGetValue( model, componentName, `${pc}_1`)
            const currentState = modelGetValue(model, componentName, pc)
            const actionName = model.__actionName
            const stateMachineId = model.__stateMachineIdForLastAction
            if (!lax && !stateLabels.includes(currentState)) {
                model.__error = `unexpected state: ${currentState}`
            } else {
                try {
                    if (actionName && previousState && !specification.states[previousState].transitions.includes(actionName)) {
                        if (stateMachineId === id) {
                            model.__error = `unexpected action ${actionName} for state: ${currentState}`
                        }
                    }
                } catch(e) {
                    model.__error = `unexpected error: ${e.message} for action ${actionName} and state: ${currentState}`
                } 
            }
        }
    ]
    if (blockUnexpectedActions) {
        smr.push( model => () => {
            const currentState = modelGetValue(model, componentName, pc)
            const { transitions = [], guards = [] } = specification.states[currentState]
            model.__blockUnexpectedActions = true
            model.__allowedActions = (model.__allowedActions || [])
                .concat(transitions
                    .filter(t => guards.reduce(
                        (f, g) => (g.action || transitions[0]) === t 
                                    ? f && g.condition(model) 
                                    : f && true,
                        true)
                    )
                )
            if (model.allowedActions().length === 0) {
                model.__allowedActions = ['__EMPTY']
            }
        })
    }
    if (composite) {
        smr.push( model => () => {
            const currentParentState = modelGetValue(model, composite.onState.component, composite.onState.pc)
            if (currentParentState !== composite.onState?.label) {
                model.__disallowedActions = (model.__disallowedActions || [])
                    .concat(Object.keys(actions))
            }
        })
    }
    return smr
}

const stateForAction = (actions, action) => actions[action][0]

function getStatesFrom(states, transitions) {
    if (!states) {
        let specification
        switch (typeof transitions) {
            case 'object':
                specification = actionsAndStatesFor(flattenTransitions(transitions))
                break
            default:
                specification = actionsAndStatesFor(transitions)
        }
        return specification
    } else {
        return { states }
    }
}

const actionsFor = (actions, transitions) => actions ? actions : actionsAndStatesFor(transitions).actions

const step = (step = 0, value = 'other') => `${step}. ${value}`

const updateRuntime = (stateMachine, currentState, previousState, action = 'other') => {
    stateMachine.step = 1 + (stateMachine.step || 0)
    const actionLabel = step(stateMachine.step, action)
    if (!stateMachine.states[currentState]) {
        stateMachine.states[currentState] = {
            transitions: []
        }
    }
    if (!stateMachine.actions[actionLabel]) {
        stateMachine.actions[actionLabel] = [currentState]
    } else {
        stateMachine.actions[actionLabel].indexOf(currentState) === -1
        && stateMachine.actions[actionLabel].push(currentState)
    }
    if (previousState) {
        if (stateMachine.states[previousState]) {
            stateMachine.states[previousState].transitions.indexOf(actionLabel) === -1
            && stateMachine.states[previousState].transitions.push(actionLabel)
        } 
    }
}

function stateMachineAcceptors({ pc0, actions, states, composite, transitions, pc, id, componentName, deterministic, lax, enforceAllowedTransitions, stateDiagram }) {
    const specification = getStatesFrom(states, transitions)
    const stateLabels = Object.keys(specification.states)
    actions = actions || specification.actions
    const acceptors = deterministic 
        ? [model => proposal => {
            if (!proposal.__stateMachineId || proposal.__stateMachineId === id) {
                const currentState = modelGetValue(model, componentName, pc)
                if (!enforceAllowedTransitions 
                    || (
                        enforceAllowedTransitions 
                        && specification.states[currentState].transitions.includes(proposal.__actionName)
                    )
                ) {
                    modelSetValue(model, componentName, `${pc}_1`, currentState)
                    modelSetValue(model, componentName, pc, stateForAction(actions, proposal.__actionName))
                    updateRuntime(stateDiagram, modelGetValue(model, componentName, pc), currentState, proposal.__actionName)
                } else {
                    if (composite) {
                        const actionFromComposite = Object.keys(actionsFor(actions, transitions)).map(action => action === proposal.__actionName).reduce((acc, v) => v || acc, false)
                        if (actionFromComposite && modelGetValue(model, composite.onState?.component, composite.onState?.pc) === composite.onState?.label) {
                            model.__error = `unexpected action ${proposal.__actionName} for state: ${currentState}`
                        }
                    } else {
                        model.__error = `unexpected action ${proposal.__actionName} for state: ${currentState}`
                    }
                }
            } 
        }]
        : stateLabels.map(label => specification.states[label].acceptor)
    acceptors.unshift( 
        model => proposal => { 
            model.__actionName = proposal.__actionName 
            model.__stateMachineIdForLastAction = proposal.__stateMachineId
        }, 
        model => () => { 
            model.__allowedActions = []
            model.__disallowedActions = []
        }
    )
    return acceptors
}        

function stateMachineNaps({ states, composite, transitions, pc, componentName }) {
    const specification = getStatesFrom(states, transitions)
    const stateLabels = Object.keys(specification.states)
    const fsmNaps = stateLabels
                .map(state => (specification.states[state].naps || []).map(nap => ({ state, condition: nap.condition, nextAction: nap.nextAction })))
                .flat()
                .map(predicate => (state) => () => {
                    if (state[pc] === predicate.state && predicate.condition(state)) {
                        predicate.nextAction(state)
                        return false
                    }
                })
    if (composite) {
        return fsmNaps.concat(composite.transitions.map( t => (state) => () => {
            if (state[pc] === t.onState) {
                t.action(t.proposal.reduce((o, key) => Object.assign(o, {
                            [key]: state[key]
                        }
                    ), {})
                )
                return false
            }
        }))
    }
    return fsmNaps
}

const gvt = (start, end, action = '', condition) => `${start} -> ${end} [label = "${action}${condition ? `\\n${condition}` : ''}"];`

function renderGraphViz({ pc0, actions, states, transitions, deterministic }) {
    const specification = getStatesFrom(states, transitions)
    actions = actions || specification.actions
    let pcEnd
    const graphVizTransitions = Object.keys(states).map(state => {
        pcEnd = !pcEnd && (!states[state]?.transitions || !states[state].transitions[0]) ? state : undefined 
        return (states[state].transitions || []).map(transition => {
            const condition = (states[state].guards || []).reduce( 
                (a, c) => c.action === transition
                    ? (c.condition.toString().split('return')[1]).split(';')[0] 
                    : a, 
                    undefined
            )
            return gvt(state, actions[transition][0], transition, condition )
        }).join('\n')
    }).join('\n')
    
    const output = `
digraph fsm_diagram {
rankdir=LR;
size="8,5"
${pc0} [shape = circle margin=0 fixedsize=true width=0.33 fontcolor=black style=filled color=black label="\\n\\n\\n${pc0}"]
${pcEnd ? `${pcEnd} [shape = doublecircle margin=0 style=filled fontcolor=white color=black]` : '\n'}
node [shape = Mrecord];
${graphVizTransitions}
}
    `   
    return output
}

function runTimeStateDiagram(pc0, stateDiagram, deterministic) {
    stateDiagram.actions = {}
    stateDiagram.states = { [pc0]: { transitions: [] }}
    stateDiagram.step = 0
    
    return () => renderGraphViz({ pc0, actions: stateDiagram.actions, states: stateDiagram.states, deterministic })
}

function fsm ({ componentName, pc0, actions, transitions, states, composite, pc = 'pc', deterministic = false, lax = true, enforceAllowedTransitions = false, blockUnexpectedActions = false , stateDiagram = {}, id = Date.now() + Math.floor(Math.random() * 100000000) }) {
    return {
        id,
        initialState: model => { 
            modelSetValue(model, componentName, pc, pc0)
            model.__actionName = undefined
            return model
        }, 
        addAction: addAction(actions, id),
        stateMachine: stateMachineReactor({ id, componentName, pc0, actions, states, composite, transitions, pc, deterministic, lax, enforceAllowedTransitions, blockUnexpectedActions, stateDiagram }),
        acceptors: stateMachineAcceptors({ id, componentName, pc0, actions, states, composite, transitions, pc, deterministic, lax, enforceAllowedTransitions, stateDiagram }),
        naps: stateMachineNaps({ id, states, componentName, composite, pc }),
        event: eventName => { 
            const action = () => ({ __actionName: eventName, __stateMachineId: id })
            action.__actionName = eventName
            action.__stateMachineId = id
            return action
        },
        stateDiagram: renderGraphViz({ pc0, actions, transitions, states, deterministic }),
        runtimeStateDiagram: runTimeStateDiagram(pc0, stateDiagram, deterministic)
    }
}

fsm.flattenTransitions = flattenTransitions
fsm.actionsAndStatesFor = actionsAndStatesFor

export default fsm