(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = global || self, global.tp = factory());
}(this, function () { 'use strict';

    // ISC License (ISC)
    // Copyright 2019 Jean-Jacques Dubray

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

    function addAction(actions) {
        const _actions = actions;
        return function(intent, action) {
            if (checkAction(_actions, action)) {
                return function() {
                    const proposal = intent.apply(this, arguments);
                    proposal.__fsmActionName = action;
                    return proposal
                }
            }
            throw new Error(`addAction invalid action: ${action}`)
        }
    }

    function stateMachineReactor({ pc0, actions, states, pc = 'pc', deterministic = false, lax = true, enforceAllowedTransitions = false }) {
        const _pc = pc;
        const _states = states;
        const _lax = lax;
        const _enforceAllowedTransitions = enforceAllowedTransitions;
        return [
            model => () => {
                const currentState = model[_pc];
                const stateLabels = Object.keys(_states);
                if (!_lax && !stateLabels.includes(currentState)) {
                    model.__error = `unexpected state: ${currentState}`;
                } else {
                    try {
                        if (_enforceAllowedTransitions && !states[model[_pc]].transitions.includes(model.__fsmActionName)) {
                            model.__error = `unexpected action ${model.__fsmActionName} for state: ${currentState}`;
                        }
                    } catch(e) {
                        model.__error = `unexpected error: ${e.message} for action ${model.__fsmActionName} and state: ${currentState}`;
                    } 
                }
            }
        ]
    }

    const stateForAction = (actions, action) => actions[action][0];

    function stateMachineAcceptors({ pc0, actions, states, pc, deterministic, lax, enforceAllowedTransitions }) {
        const stateLabels = Object.keys(states);
        const _states = states;
        const _actions = actions;
        const _deterministic = deterministic;
        const acceptors = _deterministic 
            ? [model => proposal => {
                model[pc] = stateForAction(_actions, proposal.__fsmActionName);
            }]
            : stateLabels.map(label => _states[label].acceptor);
        acceptors.push(model => proposal => { model.__fsmActionName = proposal.__fsmActionName; });
        return acceptors
    }

    const fsm = ({ pc0, actions, states, pc = 'pc', deterministic = false, lax = true, enforceAllowedTransitions = false }) => ({
        initialState: model => { 
            model[pc] = pc0;
            model.__fsmActionName = undefined;
        }, 
        addAction: addAction(actions),  
        stateMachine: stateMachineReactor({ pc0, actions, states, pc, deterministic, lax, enforceAllowedTransitions }),
        acceptors: stateMachineAcceptors({ pc0, actions, states, pc, deterministic, lax, enforceAllowedTransitions }),
        send: action => ({ __fsmActionName: action }) 
    });

    // ISC License (ISC)

    var index = {
      fsm 
    };

    return index;

}));
