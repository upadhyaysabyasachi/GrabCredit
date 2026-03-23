"""Checkout state machine.

Valid transitions:
  INITIATED -> PENDING
  PENDING -> SUCCESS | DECLINED | FAILED | TIMED_OUT

Terminal states: SUCCESS, DECLINED, FAILED, TIMED_OUT
No backward transitions permitted.
"""

from models import CheckoutStatus

# Map of valid transitions: current_state -> set of allowed next states
VALID_TRANSITIONS: dict[CheckoutStatus, set[CheckoutStatus]] = {
    CheckoutStatus.INITIATED: {CheckoutStatus.PENDING, CheckoutStatus.FAILED},
    CheckoutStatus.PENDING: {
        CheckoutStatus.SUCCESS,
        CheckoutStatus.DECLINED,
        CheckoutStatus.FAILED,
        CheckoutStatus.TIMED_OUT,
    },
}

TERMINAL_STATES: set[CheckoutStatus] = {
    CheckoutStatus.SUCCESS,
    CheckoutStatus.DECLINED,
    CheckoutStatus.FAILED,
    CheckoutStatus.TIMED_OUT,
}


def can_transition(from_state: CheckoutStatus, to_state: CheckoutStatus) -> bool:
    """Check if a state transition is valid."""
    allowed = VALID_TRANSITIONS.get(from_state, set())
    return to_state in allowed


def is_terminal(state: CheckoutStatus) -> bool:
    """Check if a state is terminal (no further transitions allowed)."""
    return state in TERMINAL_STATES


def transition(from_state: CheckoutStatus, to_state: CheckoutStatus) -> CheckoutStatus:
    """Perform a state transition, raising ValueError if invalid."""
    if not can_transition(from_state, to_state):
        raise ValueError(
            f"Invalid state transition: {from_state.value} -> {to_state.value}"
        )
    return to_state
