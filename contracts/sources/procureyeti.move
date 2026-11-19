
module procureyeti::procureyeti;

use std::internal;
use std::option::{Self, Option};
use std::type_name;
use std::vector;

use sui::allowance::{
    Self,
    Allowance,
    AllowanceCap,
    AllowanceProposal,
    AllowanceWithdrawal,
};
use sui::balance::{Self, Balance};
use sui::clock::{Self, Clock};
use sui::coin;
use sui::object::{Self, UID, ID};
use sui::sui::SUI;
use sui::transfer;
use sui::tx_context::{Self, TxContext};

const EInvalidLimits: u64 = 0;
const ENotOwner: u64 = 1;
const EInvalidAgent: u64 = 2;
const EPolicyInactive: u64 = 3;
const EInvalidSupplier: u64 = 4;
const EInvalidPurchaseAmount: u64 = 5;
const EAllowanceAlreadyRegistered: u64 = 6;
const EInvalidAllowance: u64 = 7;
const EAllowanceNotRegistered: u64 = 8;
const EPurchaseNotFound: u64 = 9;
const ENotAgent: u64 = 10;
const EPurchaseAlreadyExecuted: u64 = 11;
const EPurchaseNotApproved: u64 = 12;
const EDailyLimitExceeded: u64 = 13;
const EIncorrectWithdrawalAmount: u64 = 14;
const EAllowanceMismatch: u64 = 15;

/// Application marker used to bind native Sui allowances to ProcureYeti.
public struct ProcureYetiApp has drop {}

/// One approved purchase.
public struct PurchaseApproval has store {
    purchase_id: u64,
    supplier: address,
    amount_mist: u64,
    approved: bool,
    executed: bool,
}

/// Shared business procurement policy.
public struct ProcurementPolicy has key {
    id: UID,
    owner: address,
    agent: address,
    max_per_purchase_mist: u64,
    daily_limit_mist: u64,
    daily_spent_mist: u64,
    current_day: u64,
    active: bool,
    allowance_id: Option<ID>,
    next_purchase_id: u64,
    purchases: vector<PurchaseApproval>,
}

/// Creates and shares a procurement policy.
/// The transaction sender becomes the business owner.
public fun create_policy(
    agent: address,
    max_per_purchase_mist: u64,
    daily_limit_mist: u64,
    ctx: &mut TxContext,
) {
    assert!(agent != @0x0, EInvalidAgent);

    assert!(
        max_per_purchase_mist > 0
            && daily_limit_mist > 0
            && max_per_purchase_mist <= daily_limit_mist,
        EInvalidLimits,
    );

    let policy = ProcurementPolicy {
        id: object::new(ctx),
        owner: tx_context::sender(ctx),
        agent,
        max_per_purchase_mist,
        daily_limit_mist,
        daily_spent_mist: 0,
        current_day: 0,
        active: true,
        allowance_id: option::none(),
        next_purchase_id: 1,
        purchases: vector[],
    };

    transfer::share_object(policy);
}

/// Accepts an allowance proposal specifically configured for ProcureYeti.
public fun accept_allowance(
    policy: &ProcurementPolicy,
    proposal: AllowanceProposal<Balance<SUI>>,
    ctx: &mut TxContext,
) {
    assert!(tx_context::sender(ctx) == policy.owner, ENotOwner);
    assert!(policy.active, EPolicyInactive);

    assert!(
        option::is_none(&policy.allowance_id),
        EAllowanceAlreadyRegistered,
    );

    let settings = allowance::allowance_proposal_settings(&proposal);

    assert!(
        allowance::funder(settings) == policy.owner,
        EInvalidAllowance,
    );

    assert!(
        allowance::spender(settings) == option::some(policy.agent),
        EInvalidAllowance,
    );

    let app_type = allowance::app(settings);

    assert!(
        option::contains(
            &app_type,
            &type_name::with_defining_ids<ProcureYetiApp>(),
        ),
        EInvalidAllowance,
    );

    assert!(
        option::is_some(&allowance::lifetime_cap(settings)),
        EInvalidAllowance,
    );

    assert!(
        option::is_some(&allowance::expiration_timestamp_ms(settings)),
        EInvalidAllowance,
    );

    allowance::issue<Balance<SUI>, ProcureYetiApp>(
        proposal,
        allowance::settings_permit(
            internal::permit<ProcureYetiApp>(),
        ),
        ctx,
    );
}

/// Registers the exact allowance created for this policy.
/// The owner retains the cap and can revoke the native allowance.
public fun register_allowance(
    policy: &mut ProcurementPolicy,
    cap: &AllowanceCap<Balance<SUI>>,
    ctx: &TxContext,
) {
    assert!(tx_context::sender(ctx) == policy.owner, ENotOwner);
    assert!(policy.active, EPolicyInactive);

    assert!(
        option::is_none(&policy.allowance_id),
        EAllowanceAlreadyRegistered,
    );

    let registered_id = allowance::allowance_cap_allowance(cap);
    policy.allowance_id = option::some(registered_id);
}

/// Allows the owner to approve a purchase for a supplier.
public fun approve_purchase(
    policy: &mut ProcurementPolicy,
    supplier: address,
    amount_mist: u64,
    ctx: &TxContext,
): u64 {
    assert!(tx_context::sender(ctx) == policy.owner, ENotOwner);
    assert!(policy.active, EPolicyInactive);
    assert!(supplier != @0x0, EInvalidSupplier);

    assert!(
        amount_mist > 0
            && amount_mist <= policy.max_per_purchase_mist,
        EInvalidPurchaseAmount,
    );

    let purchase_id = policy.next_purchase_id;
    policy.next_purchase_id = purchase_id + 1;

    vector::push_back(
        &mut policy.purchases,
        PurchaseApproval {
            purchase_id,
            supplier,
            amount_mist,
            approved: true,
            executed: false,
        },
    );

    purchase_id
}

/// Executes one previously approved purchase.
///
/// Only the registered agent may call this function.
/// The amount and recipient are read from the owner's stored approval.
/// The withdrawal must use the exact allowance registered to this policy.
public fun execute_purchase(
    policy: &mut ProcurementPolicy,
    allowance_obj: &mut Allowance<Balance<SUI>>,
    clock: &Clock,
    purchase_id: u64,
    withdrawal: AllowanceWithdrawal<Balance<SUI>>,
    ctx: &mut TxContext,
) {
    assert!(tx_context::sender(ctx) == policy.agent, ENotAgent);
    assert!(policy.active, EPolicyInactive);

    assert!(
        option::is_some(&policy.allowance_id),
        EAllowanceNotRegistered,
    );

    assert!(
        option::contains(
            &policy.allowance_id,
            &object::id(allowance_obj),
        ),
        EAllowanceMismatch,
    );

    // Find the approved purchase record.
    let mut index = 0;
    let mut found = false;
    let mut supplier = @0x0;
    let mut amount_mist = 0;

    while (index < vector::length(&policy.purchases)) {
        let purchase = vector::borrow(&policy.purchases, index);

        if (purchase.purchase_id == purchase_id) {
            assert!(purchase.approved, EPurchaseNotApproved);
            assert!(!purchase.executed, EPurchaseAlreadyExecuted);

            supplier = purchase.supplier;
            amount_mist = purchase.amount_mist;
            found = true;
            break
        };

        index = index + 1;
    };

    assert!(found, EPurchaseNotFound);

    // Recheck the per-purchase limit.
    assert!(
        amount_mist > 0
            && amount_mist <= policy.max_per_purchase_mist,
        EInvalidPurchaseAmount,
    );

    // Calculate the current UTC day from the Sui Clock.
    let today = clock::timestamp_ms(clock) / 86400000;

    // Reset aggregate business spending at the start of a new UTC day.
    if (today != policy.current_day) {
        policy.current_day = today;
        policy.daily_spent_mist = 0;
    };

    // Check the business-wide daily limit before withdrawing.
    assert!(
        policy.daily_spent_mist <= policy.daily_limit_mist,
        EDailyLimitExceeded,
    );

    assert!(
        amount_mist <= policy.daily_limit_mist - policy.daily_spent_mist,
        EDailyLimitExceeded,
    );

    // Withdraw through the exact app-bound allowance.
    let payment_balance = allowance_obj.app_balance_spend(
        allowance::spend_permit(
            internal::permit<ProcureYetiApp>(),
        ),
        withdrawal,
        clock,
        ctx,
    );

    // The withdrawal must equal the owner's approved amount.
    assert!(
        balance::value(&payment_balance) == amount_mist,
        EIncorrectWithdrawalAmount,
    );

    // Mark the purchase as executed and account for the spending.
    let purchase = vector::borrow_mut(&mut policy.purchases, index);
    purchase.executed = true;

    policy.daily_spent_mist = policy.daily_spent_mist + amount_mist;

    // Convert the withdrawn balance into a transferable SUI coin.
    let payment_coin = coin::from_balance<SUI>(payment_balance, ctx);

    // Send the payment to the supplier recorded in the approval.
    transfer::public_transfer(payment_coin, supplier);
}

/// Deactivates the procurement policy.
/// Only the business owner can do this.
public fun deactivate_policy(
    policy: &mut ProcurementPolicy,
    ctx: &TxContext,
) {
    assert!(tx_context::sender(ctx) == policy.owner, ENotOwner);
    policy.active = false;
}
