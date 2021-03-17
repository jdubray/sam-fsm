(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = global || self, global.tpFSM = factory());
}(this, function () { 'use strict';

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
            if (checkAction(actions, action)) {
                return async function() {
                    const proposal = await intent.apply(this, arguments);
                    proposal.__fsmActionName = action;
                    return proposal
                }
            }
            throw new Error(`addAction invalid action: ${action}`)
        }
    }

    function stateMachineReactor({ pc0, actions, states, pc = 'pc', deterministic = false, lax = true, enforceAllowedTransitions = false }) {
        return [
            model => () => {
                const previousState = model[`${pc}_1`];
                const currentState = model[pc];
                const stateLabels = Object.keys(states);
                const actionName = model.__fsmActionName;
                if (lax && !stateLabels.includes(currentState)) {
                    model.__error = `unexpected state: ${currentState}`;
                } else {
                    try {
                        if (enforceAllowedTransitions && actionName && previousState && !states[previousState].transitions.includes(actionName)) {
                            model.__error = `unexpected action ${actionName} for state: ${currentState}`;
                        }
                    } catch(e) {
                        model.__error = `unexpected error: ${e.message} for action ${actionName} and state: ${currentState}`;
                    } 
                }
            }
        ]
    }

    const stateForAction = (actions, action) => actions[action][0];

    function stateMachineAcceptors({ pc0, actions, states, pc, deterministic, lax, enforceAllowedTransitions }) {
        const stateLabels = Object.keys(states);
        const acceptors = deterministic 
            ? [model => proposal => {
                if (!enforceAllowedTransitions || (enforceAllowedTransitions && states[model[pc]].transitions.includes(proposal.__fsmActionName))) {
                    model[`${pc}_1`] = model[pc];
                    model[pc] = stateForAction(actions, proposal.__fsmActionName);
                }
            }]
            : stateLabels.map(label => states[label].acceptor);
        acceptors.push(model => proposal => { model.__fsmActionName = proposal.__fsmActionName; });
        return acceptors
    }

    function stateMachineNaps({ states, pc }) {
        const stateLabels = Object.keys(states);
        return stateLabels
                    .map(state => (states[state].naps || []).map(nap => ({ state, condition: nap.condition, nextAction: nap.nextAction })))
                    .flat()
                    .map(predicate => (state) => () => {
                        if (state[pc] === predicate.state && predicate.condition(state)) {
                            predicate.nextAction(state);
                            return false
                        }
                    })
    }

    function fsm ({ pc0, actions, states, pc = 'pc', deterministic = false, lax = true, enforceAllowedTransitions = false }) {
        return {
            initialState: model => { 
                model[pc] = pc0;
                model.__fsmActionName = undefined;
                return model
            }, 
            addAction: addAction(actions),  
            stateMachine: stateMachineReactor({ pc0, actions, states, pc, deterministic, lax, enforceAllowedTransitions }),
            acceptors: stateMachineAcceptors({ pc0, actions, states, pc, deterministic, lax, enforceAllowedTransitions }),
            naps: stateMachineNaps({ states, pc }),
            send: action => () => ({ __fsmActionName: action }) 
        }
    }

    fsm.flattenTransitions = flattenTransitions;
    fsm.actionsAndStatesFor = actionsAndStatesFor;

    // ISC License (ISC)

    var index = {
      fsm 
    };

    return index;

}));
