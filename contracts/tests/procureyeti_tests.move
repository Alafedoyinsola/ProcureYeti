
#[test_only]
module procureyeti::procureyeti_tests;

use std::option;
use std::string::String;

use procureyeti::procureyeti::{Self, ProcurementPolicy, ProcureYetiApp};
use sui::allowance::{Self, Allowance, AllowanceCap};
use sui::balance::{Self, Balance};
use sui::clock;
use sui::coin::{Self, Coin};
use sui::object;
use sui::sui::SUI;
use sui::test_scenario::{Self, Scenario};

// =========================================================================
// Existing Working Tests
// =========================================================================

/// The owner can approve a valid purchase.
#[test]
fun test_owner_can_approve_purchase() {
    let owner = @0xA;
    let agent = @0xB;
    let supplier = @0xC;

    let mut scenario = test_scenario::begin(owner);

    procureyeti::create_policy(
        agent,
        1_000,
        5_000,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::next_tx(&mut scenario, owner);

    let mut policy =
        test_scenario::take_shared<procureyeti::ProcurementPolicy>(&scenario);

    let purchase_id = procureyeti::approve_purchase(
        &mut policy,
        supplier,
        500,
        test_scenario::ctx(&mut scenario),
    );

    assert!(purchase_id == 1, 0);

    test_scenario::return_shared(policy);
    test_scenario::end(scenario);
}

/// The agent cannot approve a purchase.
#[test, expected_failure(abort_code = 1)]
fun test_agent_cannot_approve_purchase() {
    let owner = @0xA;
    let agent = @0xB;
    let supplier = @0xC;

    let mut scenario = test_scenario::begin(owner);

    procureyeti::create_policy(
        agent,
        1_000,
        5_000,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::next_tx(&mut scenario, agent);

    let mut policy =
        test_scenario::take_shared<procureyeti::ProcurementPolicy>(&scenario);

    procureyeti::approve_purchase(
        &mut policy,
        supplier,
        500,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::return_shared(policy);
    test_scenario::end(scenario);
}

/// Purchases above the per-purchase limit are rejected.
#[test, expected_failure(abort_code = 5)]
fun test_purchase_above_limit_is_rejected() {
    let owner = @0xA;
    let agent = @0xB;
    let supplier = @0xC;

    let mut scenario = test_scenario::begin(owner);

    procureyeti::create_policy(
        agent,
        1_000,
        5_000,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::next_tx(&mut scenario, owner);

    let mut policy =
        test_scenario::take_shared<procureyeti::ProcurementPolicy>(&scenario);

    procureyeti::approve_purchase(
        &mut policy,
        supplier,
        1_500,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::return_shared(policy);
    test_scenario::end(scenario);
}

/// Zero-value purchases are rejected.
#[test, expected_failure(abort_code = 5)]
fun test_zero_purchase_amount_is_rejected() {
    let owner = @0xA;
    let agent = @0xB;
    let supplier = @0xC;

    let mut scenario = test_scenario::begin(owner);

    procureyeti::create_policy(
        agent,
        1_000,
        5_000,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::next_tx(&mut scenario, owner);

    let mut policy =
        test_scenario::take_shared<procureyeti::ProcurementPolicy>(&scenario);

    procureyeti::approve_purchase(
        &mut policy,
        supplier,
        0,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::return_shared(policy);
    test_scenario::end(scenario);
}

/// The zero address cannot be used as a supplier.
#[test, expected_failure(abort_code = 4)]
fun test_zero_address_supplier_is_rejected() {
    let owner = @0xA;
    let agent = @0xB;

    let mut scenario = test_scenario::begin(owner);

    procureyeti::create_policy(
        agent,
        1_000,
        5_000,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::next_tx(&mut scenario, owner);

    let mut policy =
        test_scenario::take_shared<procureyeti::ProcurementPolicy>(&scenario);

    procureyeti::approve_purchase(
        &mut policy,
        @0x0,
        500,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::return_shared(policy);
    test_scenario::end(scenario);
}

/// A zero address cannot be registered as the agent.
#[test, expected_failure(abort_code = 2)]
fun test_zero_address_agent_is_rejected() {
    let owner = @0xA;

    let mut scenario = test_scenario::begin(owner);

    procureyeti::create_policy(
        @0x0,
        1_000,
        5_000,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::end(scenario);
}

/// Invalid spending limits are rejected.
#[test, expected_failure(abort_code = 0)]
fun test_invalid_policy_limits_are_rejected() {
    let owner = @0xA;
    let agent = @0xB;

    let mut scenario = test_scenario::begin(owner);

    procureyeti::create_policy(
        agent,
        0,
        5_000,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::end(scenario);
}

/// The agent cannot deactivate the owner's policy.
#[test, expected_failure(abort_code = 1)]
fun test_agent_cannot_deactivate_policy() {
    let owner = @0xA;
    let agent = @0xB;

    let mut scenario = test_scenario::begin(owner);

    procureyeti::create_policy(
        agent,
        1_000,
        5_000,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::next_tx(&mut scenario, agent);

    let mut policy =
        test_scenario::take_shared<procureyeti::ProcurementPolicy>(&scenario);

    procureyeti::deactivate_policy(
        &mut policy,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::return_shared(policy);
    test_scenario::end(scenario);
}

/// Once the owner deactivates the policy, new approvals are rejected.
#[test, expected_failure(abort_code = 3)]
fun test_deactivated_policy_rejects_approvals() {
    let owner = @0xA;
    let agent = @0xB;
    let supplier = @0xC;

    let mut scenario = test_scenario::begin(owner);

    procureyeti::create_policy(
        agent,
        1_000,
        5_000,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::next_tx(&mut scenario, owner);

    let mut policy =
        test_scenario::take_shared<procureyeti::ProcurementPolicy>(&scenario);

    procureyeti::deactivate_policy(
        &mut policy,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::return_shared(policy);

    test_scenario::next_tx(&mut scenario, owner);

    let mut policy =
        test_scenario::take_shared<procureyeti::ProcurementPolicy>(&scenario);

    procureyeti::approve_purchase(
        &mut policy,
        supplier,
        500,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::return_shared(policy);
    test_scenario::end(scenario);
}

// =========================================================================
// Payment Execution Helper & Tests
// =========================================================================

/// Helper: sets up a funded owner, policy, app-bound allowance, and registers it.
fun setup_policy_with_allowance(
    owner: address,
    agent: address,
    max_per_purchase: u64,
    daily_limit: u64,
    lifetime_cap: u64,
    funder_initial_balance: u64,
): Scenario {
    let mut scenario = test_scenario::begin(owner);

    // Provide owner with settled balance in the live funds accumulator
    balance::create_for_testing<SUI>(funder_initial_balance).send_funds(owner);

    // Create policy
    procureyeti::create_policy(
        agent,
        max_per_purchase,
        daily_limit,
        test_scenario::ctx(&mut scenario),
    );

    // Owner creates allowance proposal and accepts it
    test_scenario::next_tx(&mut scenario, owner);
    let proposal = allowance::propose_for_app<Balance<SUI>, ProcureYetiApp>(
        b"ProcureYeti Allowance".to_string(),
        agent,
        option::some(lifetime_cap as u256),
        option::none(),
        option::some(100_000_000),
        option::none(),
        test_scenario::ctx(&mut scenario),
    );
    let policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    procureyeti::accept_allowance(&policy, proposal, test_scenario::ctx(&mut scenario));
    test_scenario::return_shared(policy);

    // Owner registers the allowance cap
    test_scenario::next_tx(&mut scenario, owner);
    let cap = test_scenario::take_from_sender<AllowanceCap<Balance<SUI>>>(&scenario);
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    procureyeti::register_allowance(&mut policy, &cap, test_scenario::ctx(&mut scenario));
    test_scenario::return_to_address(owner, cap);
    test_scenario::return_shared(policy);

    scenario
}

/// The agent can execute an owner-approved purchase.
#[test]
fun test_execute_purchase_success() {
    let owner = @0xA;
    let agent = @0xB;
    let supplier = @0xC;

    let mut scenario = setup_policy_with_allowance(
        owner,
        agent,
        1_000,
        5_000,
        10_000,
        20_000,
    );

    // Owner approves purchase of 500 Mist
    test_scenario::next_tx(&mut scenario, owner);
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    let purchase_id = procureyeti::approve_purchase(
        &mut policy,
        supplier,
        500,
        test_scenario::ctx(&mut scenario),
    );
    test_scenario::return_shared(policy);

    // Agent executes purchase
    test_scenario::next_tx(&mut scenario, agent);
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    let mut allowance_obj = test_scenario::take_shared<Allowance<Balance<SUI>>>(&scenario);
    let allowance_id = object::id(&allowance_obj);

    let withdrawal = allowance::new_withdrawal_for_testing<Balance<SUI>>(
        allowance_id,
        test_scenario::withdraw_balance_from_address<SUI>(owner, 500),
    );

    procureyeti::execute_purchase(
        &mut policy,
        &mut allowance_obj,
        clock::borrow(),
        purchase_id,
        withdrawal,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::return_shared(policy);
    test_scenario::return_shared(allowance_obj);

    // Supplier receives the exact 500 SUI coin
    test_scenario::next_tx(&mut scenario, supplier);
    let coin = test_scenario::take_from_sender<Coin<SUI>>(&scenario);
    assert!(coin::value(&coin) == 500, 0);
    coin.burn_for_testing();

    test_scenario::end(scenario);
}

/// A non-agent caller cannot execute a purchase.
#[test, expected_failure(abort_code = 10)]
fun test_execute_purchase_non_agent_rejected() {
    let owner = @0xA;
    let agent = @0xB;
    let supplier = @0xC;
    let stranger = @0xD;

    let mut scenario = setup_policy_with_allowance(
        owner,
        agent,
        1_000,
        5_000,
        10_000,
        20_000,
    );

    // Owner approves purchase
    test_scenario::next_tx(&mut scenario, owner);
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    let purchase_id = procureyeti::approve_purchase(
        &mut policy,
        supplier,
        500,
        test_scenario::ctx(&mut scenario),
    );
    test_scenario::return_shared(policy);

    // Stranger attempts to execute purchase
    test_scenario::next_tx(&mut scenario, stranger);
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    let mut allowance_obj = test_scenario::take_shared<Allowance<Balance<SUI>>>(&scenario);
    let allowance_id = object::id(&allowance_obj);

    let withdrawal = allowance::new_withdrawal_for_testing<Balance<SUI>>(
        allowance_id,
        test_scenario::withdraw_balance_from_address<SUI>(owner, 500),
    );

    procureyeti::execute_purchase(
        &mut policy,
        &mut allowance_obj,
        clock::borrow(),
        purchase_id,
        withdrawal,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::return_shared(policy);
    test_scenario::return_shared(allowance_obj);
    test_scenario::end(scenario);
}

/// Executing without a registered allowance is rejected.
#[test, expected_failure(abort_code = 8)]
fun test_execute_purchase_unregistered_allowance_rejected() {
    let owner = @0xA;
    let agent = @0xB;
    let supplier = @0xC;

    let mut scenario = test_scenario::begin(owner);
    balance::create_for_testing<SUI>(20_000).send_funds(owner);

    procureyeti::create_policy(
        agent,
        1_000,
        5_000,
        test_scenario::ctx(&mut scenario),
    );

    // Owner creates and accepts allowance, but does NOT register it
    test_scenario::next_tx(&mut scenario, owner);
    let proposal = allowance::propose_for_app<Balance<SUI>, ProcureYetiApp>(
        b"ProcureYeti Allowance".to_string(),
        agent,
        option::some(10_000),
        option::none(),
        option::some(100_000_000),
        option::none(),
        test_scenario::ctx(&mut scenario),
    );
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    procureyeti::accept_allowance(&policy, proposal, test_scenario::ctx(&mut scenario));
    let purchase_id = procureyeti::approve_purchase(
        &mut policy,
        supplier,
        500,
        test_scenario::ctx(&mut scenario),
    );
    test_scenario::return_shared(policy);

    // Agent attempts to execute purchase
    test_scenario::next_tx(&mut scenario, agent);
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    let mut allowance_obj = test_scenario::take_shared<Allowance<Balance<SUI>>>(&scenario);
    let allowance_id = object::id(&allowance_obj);

    let withdrawal = allowance::new_withdrawal_for_testing<Balance<SUI>>(
        allowance_id,
        test_scenario::withdraw_balance_from_address<SUI>(owner, 500),
    );

    procureyeti::execute_purchase(
        &mut policy,
        &mut allowance_obj,
        clock::borrow(),
        purchase_id,
        withdrawal,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::return_shared(policy);
    test_scenario::return_shared(allowance_obj);
    test_scenario::end(scenario);
}

/// Executing with an allowance different from the policy's registered allowance is rejected.
#[test, expected_failure(abort_code = 15)]
fun test_execute_purchase_mismatched_allowance_rejected() {
    let owner = @0xA;
    let agent = @0xB;
    let supplier = @0xC;

    // Sets up policy with allowance 1 registered
    let mut scenario = setup_policy_with_allowance(
        owner,
        agent,
        1_000,
        5_000,
        10_000,
        20_000,
    );

    // Owner creates a separate plain allowance
    test_scenario::next_tx(&mut scenario, owner);
    allowance::new<Balance<SUI>>(
        b"Other Allowance".to_string(),
        agent,
        option::some(10_000),
        option::none(),
        option::some(100_000_000),
        option::none(),
        test_scenario::ctx(&mut scenario),
    );

    // Owner approves purchase
    test_scenario::next_tx(&mut scenario, owner);
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    let purchase_id = procureyeti::approve_purchase(
        &mut policy,
        supplier,
        500,
        test_scenario::ctx(&mut scenario),
    );
    test_scenario::return_shared(policy);

    // Agent attempts to execute using the second (mismatched) allowance
    test_scenario::next_tx(&mut scenario, agent);
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    let mut mismatched_allowance = test_scenario::take_shared<Allowance<Balance<SUI>>>(&scenario);
    let mismatched_id = object::id(&mismatched_allowance);

    let withdrawal = allowance::new_withdrawal_for_testing<Balance<SUI>>(
        mismatched_id,
        test_scenario::withdraw_balance_from_address<SUI>(owner, 500),
    );

    procureyeti::execute_purchase(
        &mut policy,
        &mut mismatched_allowance,
        clock::borrow(),
        purchase_id,
        withdrawal,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::return_shared(policy);
    test_scenario::return_shared(mismatched_allowance);
    test_scenario::end(scenario);
}

/// Passing a withdrawal amount that differs from the owner's approved amount is rejected.
#[test, expected_failure(abort_code = 14)]
fun test_execute_purchase_incorrect_withdrawal_amount_rejected() {
    let owner = @0xA;
    let agent = @0xB;
    let supplier = @0xC;

    let mut scenario = setup_policy_with_allowance(
        owner,
        agent,
        1_000,
        5_000,
        10_000,
        20_000,
    );

    // Owner approves purchase for 500
    test_scenario::next_tx(&mut scenario, owner);
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    let purchase_id = procureyeti::approve_purchase(
        &mut policy,
        supplier,
        500,
        test_scenario::ctx(&mut scenario),
    );
    test_scenario::return_shared(policy);

    // Agent attempts to execute with a withdrawal of 400 instead of 500
    test_scenario::next_tx(&mut scenario, agent);
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    let mut allowance_obj = test_scenario::take_shared<Allowance<Balance<SUI>>>(&scenario);
    let allowance_id = object::id(&allowance_obj);

    let withdrawal = allowance::new_withdrawal_for_testing<Balance<SUI>>(
        allowance_id,
        test_scenario::withdraw_balance_from_address<SUI>(owner, 400),
    );

    procureyeti::execute_purchase(
        &mut policy,
        &mut allowance_obj,
        clock::borrow(),
        purchase_id,
        withdrawal,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::return_shared(policy);
    test_scenario::return_shared(allowance_obj);
    test_scenario::end(scenario);
}

/// Replaying an already executed purchase is rejected.
#[test, expected_failure(abort_code = 11)]
fun test_execute_purchase_replay_rejected() {
    let owner = @0xA;
    let agent = @0xB;
    let supplier = @0xC;

    let mut scenario = setup_policy_with_allowance(
        owner,
        agent,
        1_000,
        5_000,
        10_000,
        20_000,
    );

    // Owner approves purchase for 500
    test_scenario::next_tx(&mut scenario, owner);
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    let purchase_id = procureyeti::approve_purchase(
        &mut policy,
        supplier,
        500,
        test_scenario::ctx(&mut scenario),
    );
    test_scenario::return_shared(policy);

    // Agent executes purchase once
    test_scenario::next_tx(&mut scenario, agent);
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    let mut allowance_obj = test_scenario::take_shared<Allowance<Balance<SUI>>>(&scenario);
    let allowance_id = object::id(&allowance_obj);

    let withdrawal1 = allowance::new_withdrawal_for_testing<Balance<SUI>>(
        allowance_id,
        test_scenario::withdraw_balance_from_address<SUI>(owner, 500),
    );

    procureyeti::execute_purchase(
        &mut policy,
        &mut allowance_obj,
        clock::borrow(),
        purchase_id,
        withdrawal1,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::return_shared(policy);
    test_scenario::return_shared(allowance_obj);

    // Agent attempts to execute the same purchase a second time
    test_scenario::next_tx(&mut scenario, agent);
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    let mut allowance_obj = test_scenario::take_shared<Allowance<Balance<SUI>>>(&scenario);
    let allowance_id = object::id(&allowance_obj);

    let withdrawal2 = allowance::new_withdrawal_for_testing<Balance<SUI>>(
        allowance_id,
        test_scenario::withdraw_balance_from_address<SUI>(owner, 500),
    );

    procureyeti::execute_purchase(
        &mut policy,
        &mut allowance_obj,
        clock::borrow(),
        purchase_id,
        withdrawal2,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::return_shared(policy);
    test_scenario::return_shared(allowance_obj);
    test_scenario::end(scenario);
}

/// Spending exceeding the daily limit is rejected.
#[test, expected_failure(abort_code = 13)]
fun test_execute_purchase_daily_limit_rejected() {
    let owner = @0xA;
    let agent = @0xB;
    let supplier = @0xC;

    // Policy with max_per_purchase = 1,000 and daily_limit = 1,500
    let mut scenario = setup_policy_with_allowance(
        owner,
        agent,
        1_000,
        1_500,
        10_000,
        20_000,
    );

    // Owner approves two purchases: 1,000 and 800
    test_scenario::next_tx(&mut scenario, owner);
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    let purchase1 = procureyeti::approve_purchase(
        &mut policy,
        supplier,
        1_000,
        test_scenario::ctx(&mut scenario),
    );
    let purchase2 = procureyeti::approve_purchase(
        &mut policy,
        supplier,
        800,
        test_scenario::ctx(&mut scenario),
    );
    test_scenario::return_shared(policy);

    // Agent executes purchase 1 (1,000 Mist) -> succeeds
    test_scenario::next_tx(&mut scenario, agent);
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    let mut allowance_obj = test_scenario::take_shared<Allowance<Balance<SUI>>>(&scenario);
    let allowance_id = object::id(&allowance_obj);

    let withdrawal1 = allowance::new_withdrawal_for_testing<Balance<SUI>>(
        allowance_id,
        test_scenario::withdraw_balance_from_address<SUI>(owner, 1_000),
    );

    procureyeti::execute_purchase(
        &mut policy,
        &mut allowance_obj,
        clock::borrow(),
        purchase1,
        withdrawal1,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::return_shared(policy);
    test_scenario::return_shared(allowance_obj);

    // Agent attempts to execute purchase 2 (800 Mist) on the same day -> exceeds 1,500 limit
    test_scenario::next_tx(&mut scenario, agent);
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    let mut allowance_obj = test_scenario::take_shared<Allowance<Balance<SUI>>>(&scenario);
    let allowance_id = object::id(&allowance_obj);

    let withdrawal2 = allowance::new_withdrawal_for_testing<Balance<SUI>>(
        allowance_id,
        test_scenario::withdraw_balance_from_address<SUI>(owner, 800),
    );

    procureyeti::execute_purchase(
        &mut policy,
        &mut allowance_obj,
        clock::borrow(),
        purchase2,
        withdrawal2,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::return_shared(policy);
    test_scenario::return_shared(allowance_obj);
    test_scenario::end(scenario);
}

/// Spending exceeding the daily limit succeeds after the Clock rolls to the next UTC day.
#[test]
fun test_execute_purchase_next_day_reset() {
    let owner = @0xA;
    let agent = @0xB;
    let supplier = @0xC;

    // Policy with max_per_purchase = 1,000 and daily_limit = 1,500
    let mut scenario = setup_policy_with_allowance(
        owner,
        agent,
        1_000,
        1_500,
        10_000,
        20_000,
    );

    // Owner approves two purchases: 1,000 and 800
    test_scenario::next_tx(&mut scenario, owner);
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    let purchase1 = procureyeti::approve_purchase(
        &mut policy,
        supplier,
        1_000,
        test_scenario::ctx(&mut scenario),
    );
    let purchase2 = procureyeti::approve_purchase(
        &mut policy,
        supplier,
        800,
        test_scenario::ctx(&mut scenario),
    );
    test_scenario::return_shared(policy);

    // Day 0: Agent executes purchase 1 (1,000 Mist) -> succeeds
    test_scenario::next_tx(&mut scenario, agent);
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    let mut allowance_obj = test_scenario::take_shared<Allowance<Balance<SUI>>>(&scenario);
    let allowance_id = object::id(&allowance_obj);

    let withdrawal1 = allowance::new_withdrawal_for_testing<Balance<SUI>>(
        allowance_id,
        test_scenario::withdraw_balance_from_address<SUI>(owner, 1_000),
    );

    procureyeti::execute_purchase(
        &mut policy,
        &mut allowance_obj,
        clock::borrow(),
        purchase1,
        withdrawal1,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::return_shared(policy);
    test_scenario::return_shared(allowance_obj);

    // Advance Clock to next UTC day (86,400,000 ms = day 1)
    let builder = scenario.ctx_builder().set_clock_timestamp(86_400_000);
    test_scenario::next_with_context(&mut scenario, builder);

    // Day 1: Agent executes purchase 2 (800 Mist) -> daily spent has reset, succeeds
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    let mut allowance_obj = test_scenario::take_shared<Allowance<Balance<SUI>>>(&scenario);
    let allowance_id = object::id(&allowance_obj);

    let withdrawal2 = allowance::new_withdrawal_for_testing<Balance<SUI>>(
        allowance_id,
        test_scenario::withdraw_balance_from_address<SUI>(owner, 800),
    );

    procureyeti::execute_purchase(
        &mut policy,
        &mut allowance_obj,
        clock::borrow(),
        purchase2,
        withdrawal2,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::return_shared(policy);
    test_scenario::return_shared(allowance_obj);

    // Verify supplier received both payments
    test_scenario::next_tx(&mut scenario, supplier);
    let coin2 = test_scenario::take_from_sender<Coin<SUI>>(&scenario);
    assert!(coin::value(&coin2) == 800, 0);
    coin2.burn_for_testing();

    let coin1 = test_scenario::take_from_sender<Coin<SUI>>(&scenario);
    assert!(coin::value(&coin1) == 1_000, 0);
    coin1.burn_for_testing();

    test_scenario::end(scenario);
}

/// Executing on a deactivated policy is rejected.
#[test, expected_failure(abort_code = 3)]
fun test_execute_purchase_deactivated_policy_rejected() {
    let owner = @0xA;
    let agent = @0xB;
    let supplier = @0xC;

    let mut scenario = setup_policy_with_allowance(
        owner,
        agent,
        1_000,
        5_000,
        10_000,
        20_000,
    );

    // Owner approves purchase
    test_scenario::next_tx(&mut scenario, owner);
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    let purchase_id = procureyeti::approve_purchase(
        &mut policy,
        supplier,
        500,
        test_scenario::ctx(&mut scenario),
    );

    // Owner deactivates policy
    procureyeti::deactivate_policy(
        &mut policy,
        test_scenario::ctx(&mut scenario),
    );
    test_scenario::return_shared(policy);

    // Agent attempts to execute purchase on deactivated policy
    test_scenario::next_tx(&mut scenario, agent);
    let mut policy = test_scenario::take_shared<ProcurementPolicy>(&scenario);
    let mut allowance_obj = test_scenario::take_shared<Allowance<Balance<SUI>>>(&scenario);
    let allowance_id = object::id(&allowance_obj);

    let withdrawal = allowance::new_withdrawal_for_testing<Balance<SUI>>(
        allowance_id,
        test_scenario::withdraw_balance_from_address<SUI>(owner, 500),
    );

    procureyeti::execute_purchase(
        &mut policy,
        &mut allowance_obj,
        clock::borrow(),
        purchase_id,
        withdrawal,
        test_scenario::ctx(&mut scenario),
    );

    test_scenario::return_shared(policy);
    test_scenario::return_shared(allowance_obj);
    test_scenario::end(scenario);
}
