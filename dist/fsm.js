(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = global || self, global.tpFSM = factory());
}(this, (function () { 'use strict';

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
        const actionLabels = Object.keys(actions);
        return actionLabels.includes(action)
    }

    const pushAction = (s, a) => {
        s.push(a);
        return s
    };

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
    });

    const flattenTransitions = (transitions) => Object.keys(transitions).reduce((ft, t) => {
        const state = transitions[t];
        const actions = Object.keys(state);
        return ft.concat(actions.map(a => ({ from: t, to: state[a], on: a })))
    }, []);

    function addAction(actions) {
        return function(intent, action) {
            if (checkAction(actions, action) && intent) {
                intent.__actionName = 'action';
                return async function() {
                    const proposal = await intent.apply(this, arguments);
                    proposal.__actionName = action;
                    return proposal
                }
            }
            throw new Error(`addAction invalid action: ${action}`)
        }
    }

    const modelGetValue = (model, componentName, key) => 
        componentName 
            ? typeof model.localState === 'function'
                ? model.localState(componentName)[key]
                : model.__components 
                    ? model.__components[componentName][key]
                    : undefined
            : model[key];

    const modelSetValue = (model, componentName, key, value) => {
        if (componentName) {
            if (typeof model.localState === 'function') {
                model.localState(componentName)[key] = value;
            } else {
                model.__components = { [componentName]: { [key]: value }};
            }
        } else {
            model[key] = value;
        }
        return value
    };

    function stateMachineReactor({ pc0, actions, transitions, states, pc = 'pc', componentName, deterministic = false, lax = true, enforceAllowedTransitions = false, blockUnexpectedActions = false }) {
        const specification = getStatesFrom(states, transitions);
        const stateLabels = Object.keys(specification.states);
        const smr = [
            model => () => {
                const previousState = modelGetValue( model, componentName, `${pc}_1`);
                const currentState = modelGetValue(model, componentName, pc);
                const actionName = model.__actionName;
                if (!lax && !stateLabels.includes(currentState)) {
                    model.__error = `unexpected state: ${currentState}`;
                } else {
                    try {
                        if (actionName && previousState && !specification.states[previousState].transitions.includes(actionName)) {
                            model.__error = `unexpected action ${actionName} for state: ${currentState}`;
                        }
                    } catch(e) {
                        model.__error = `unexpected error: ${e.message} for action ${actionName} and state: ${currentState}`;
                    } 
                }
            }
        ];
        if (blockUnexpectedActions) {
            
            smr.push(model => () => {
                const currentState = modelGetValue(model, componentName, pc);
                const allowedActions = specification.states[currentState].transitions;
                model.__allowedActions = model.__allowedActions.concat(allowedActions);
            });
        }
        return smr
    }

    const stateForAction = (actions, action) => actions[action][0];

    function getStatesFrom(states, transitions) {
        if (!states) {
            let specification;
            switch (typeof transitions) {
                case 'object':
                    specification = actionsAndStatesFor(flattenTransitions(transitions));
                    break
                default:
                    specification = actionsAndStatesFor(transitions);
            }
            return specification
        } else {
            return { states }
        }
    }

    function stateMachineAcceptors({ pc0, actions, states, transitions, pc, componentName, deterministic, lax, enforceAllowedTransitions }) {
        const specification = getStatesFrom(states, transitions);
        const stateLabels = Object.keys(specification.states);
        actions = actions || specification.actions;
        const acceptors = deterministic 
            ? [model => proposal => {
                const currentState = modelGetValue(model, componentName, pc);
                if (!enforceAllowedTransitions 
                    || (
                        enforceAllowedTransitions 
                        && specification.states[currentState].transitions.includes(proposal.__actionName)
                    )
                ) {
                    modelSetValue(model, componentName, `${pc}_1`, currentState);
                    modelSetValue(model, componentName, pc, stateForAction(actions, proposal.__actionName));
                }
            }]
            : stateLabels.map(label => specification.states[label].acceptor);
        acceptors.push(model => proposal => { model.__actionName = proposal.__actionName; });
        acceptors.push(model => () => { model.__allowedActions = []; });
        return acceptors
    }

    function stateMachineNaps({ states, transitions, pc, componentName }) {
        const specification = getStatesFrom(states, transitions);
        const stateLabels = Object.keys(specification.states);
        return stateLabels
                    .map(state => (specification.states[state].naps || []).map(nap => ({ state, condition: nap.condition, nextAction: nap.nextAction })))
                    .flat()
                    .map(predicate => (state) => () => {
                        if (state[pc] === predicate.state && predicate.condition(state)) {
                            predicate.nextAction(state);
                            return false
                        }
                    })

        
    }

    function fsm ({ componentName, pc0, actions, transitions, states, pc = 'pc', deterministic = false, lax = true, enforceAllowedTransitions = false, blockUnexpectedActions = false }) {
        return {
            initialState: model => { 
                modelSetValue(model, componentName, pc, pc0);
                model.__actionName = undefined;
                return model
            }, 
            addAction: addAction(actions),  
            stateMachine: stateMachineReactor({ componentName, pc0, actions, states, transitions, pc, deterministic, lax, enforceAllowedTransitions, blockUnexpectedActions }),
            acceptors: stateMachineAcceptors({ componentName, pc0, actions, states, transitions, pc, deterministic, lax, enforceAllowedTransitions }),
            naps: stateMachineNaps({ states, componentName, pc }),
            event: eventName => () => ({ __actionName: eventName }) 
        }
    }

    fsm.flattenTransitions = flattenTransitions;
    fsm.actionsAndStatesFor = actionsAndStatesFor;

    // ISC License (ISC)

    var index = {
      fsm 
    };

    return index;

})));
