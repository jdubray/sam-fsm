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
        return function(intent, action) {
            if (checkAction(actions, action)) {
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
        return model => () => {
                const pc = model[pc];
                const stateLabels = Object.keys(states);
                if (!lax && !stateLabels.includes(pc)) {
                    model.__error = `unexpected state: ${pc}`;
                } else {
                    if (states[pc].transitions.includes(model.__fsmActionName)) {
                        model.__error = `unexpected action ${model.__fsmActionName} for state: ${pc}`;
                    } 
                }
            }
    }

    function stateMachineAcceptors({ pc0, actions, states, pc, deterministic, lax, enforceAllowedTransitions }) {
        const stateLabels = Object.keys(states);
        
        const acceptors = deterministic 
            ? stateLabels.map(label => model => proposal => { 
                    model[pc] = stateForAction(states, proposal.__fsmActionName);
                })
            : stateLabels.map(label => states[label].reactor);
        acceptors.push(model => proposal => model.__fsmActionName = proposal.__fsmActionName);
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
