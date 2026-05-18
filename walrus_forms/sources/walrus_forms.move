module walrus_forms::walrus_forms {
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::balance::{Self, Balance};
    use std::string::String;

    const ENotAuthorized: u64 = 0;
    const EInsufficientFunds: u64 = 1;

    // ---- Objects ----

    /// Global singleton — holds the Walrus blob ID of the forms index JSON array.
    public struct FormsRegistry has key {
        id: UID,
        registry_blob_id: String,
    }

    /// Form object with mutable manifest + admin-meta pointers.
    public struct Form has key, store {
        id: UID,
        creator: address,
        title: String,
        description: String,
        schema_blob_id: String,
        manifest_blob_id: String,      // updated after each submission batch
        admin_meta_blob_id: String,    // updated by admin when notes/status change
        bounty_pool: Balance<SUI>,
        is_active: bool,
    }

    public struct Submission has key, store {
        id: UID,
        form_id: ID,
        submitter: address,
        response_blob_id: String,
        is_encrypted: bool,
    }

    public struct FormAdminCap has key, store {
        id: UID,
        form_id: ID,
    }

    // ---- Init ----

    fun init(ctx: &mut TxContext) {
        transfer::share_object(FormsRegistry {
            id: object::new(ctx),
            registry_blob_id: std::string::utf8(b""),
        });
    }

    // ---- Registry ----

    public entry fun set_registry(
        registry: &mut FormsRegistry,
        new_blob_id: String,
        _ctx: &mut TxContext
    ) {
        registry.registry_blob_id = new_blob_id;
    }

    // ---- Form creation ----

    public entry fun create_form(
        title: String,
        description: String,
        schema_blob_id: String,
        manifest_blob_id: String,
        registry: &mut FormsRegistry,
        new_registry_blob_id: String,
        ctx: &mut TxContext
    ) {
        let id = object::new(ctx);
        let form_id = object::uid_to_inner(&id);

        let form = Form {
            id,
            creator: tx_context::sender(ctx),
            title,
            description,
            schema_blob_id,
            manifest_blob_id,
            admin_meta_blob_id: std::string::utf8(b""),
            bounty_pool: balance::zero(),
            is_active: true,
        };

        let admin_cap = FormAdminCap {
            id: object::new(ctx),
            form_id,
        };

        registry.registry_blob_id = new_registry_blob_id;

        transfer::share_object(form);
        transfer::transfer(admin_cap, tx_context::sender(ctx));
    }

    // ---- Mutable blob pointers (public — no cap required) ----

    /// Update manifest pointer. Public so the submission flow can advance it
    /// without requiring FormAdminCap (submitters don't hold the cap).
    public entry fun update_manifest(
        form: &mut Form,
        new_manifest_blob_id: String,
        _ctx: &mut TxContext
    ) {
        form.manifest_blob_id = new_manifest_blob_id;
    }

    /// Update admin-metadata blob pointer (status/notes/priority per submission).
    public entry fun update_admin_meta(
        form: &mut Form,
        new_admin_meta_blob_id: String,
        _ctx: &mut TxContext
    ) {
        form.admin_meta_blob_id = new_admin_meta_blob_id;
    }

    // ---- Submission receipt ----

    public entry fun submit_response(
        form: &Form,
        response_blob_id: String,
        is_encrypted: bool,
        ctx: &mut TxContext
    ) {
        let submission = Submission {
            id: object::new(ctx),
            form_id: object::id(form),
            submitter: tx_context::sender(ctx),
            response_blob_id,
            is_encrypted,
        };
        transfer::share_object(submission);
    }

    // ---- Bounty ----

    public entry fun fund_bounty(
        form: &mut Form,
        payment: Coin<SUI>,
        _ctx: &mut TxContext
    ) {
        balance::join(&mut form.bounty_pool, coin::into_balance(payment));
    }

    public entry fun reward_submitter(
        _admin: &FormAdminCap,
        form: &mut Form,
        recipient: address,
        amount: u64,
        ctx: &mut TxContext
    ) {
        assert!(object::id(form) == _admin.form_id, ENotAuthorized);
        assert!(balance::value(&form.bounty_pool) >= amount, EInsufficientFunds);
        let reward = coin::from_balance(balance::split(&mut form.bounty_pool, amount), ctx);
        transfer::public_transfer(reward, recipient);
    }

    public entry fun set_active(
        _admin: &FormAdminCap,
        form: &mut Form,
        active: bool,
        _ctx: &mut TxContext
    ) {
        assert!(object::id(form) == _admin.form_id, ENotAuthorized);
        form.is_active = active;
    }
}
