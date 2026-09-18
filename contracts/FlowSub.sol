// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title FlowSub — non-custodial recurring ERC-20 subscriptions
/// @notice Subscribers authorize this contract with an ERC-20 allowance. Any account may
/// execute a due payment, allowing keepers or merchants to automate collection.
contract FlowSub {
    struct Plan {
        address merchant;
        address token;
        uint96 price;
        uint32 interval;
        uint32 duration;
        bool active;
        string name;
        string description;
    }

    struct Subscription {
        uint64 planId;
        uint64 startedAt;
        uint64 nextPayment;
        uint64 expiresAt;
        uint128 totalPaid;
        bool active;
    }

    uint256 public nextPlanId = 1;
    address public immutable paymentToken;
    mapping(uint256 => Plan) private _plans;
    mapping(address => mapping(uint256 => Subscription)) private _subscriptions;
    mapping(address => uint256[]) private _merchantPlanIds;
    mapping(address => uint256[]) private _subscriberPlanIds;
    mapping(uint256 => address[]) private _planSubscribers;
    mapping(address => mapping(uint256 => bool)) private _hasSubscribed;
    bool private _locked;

    event PlanCreated(uint256 indexed planId, address indexed merchant, address indexed token, uint256 price, uint256 interval, uint256 duration, string name, string description);
    event PlanStatusChanged(uint256 indexed planId, bool active);
    event Subscribed(uint256 indexed planId, address indexed subscriber, uint256 nextPayment, uint256 expiresAt);
    event PaymentExecuted(uint256 indexed planId, address indexed subscriber, address indexed merchant, uint256 amount, uint256 nextPayment);
    event SubscriptionCanceled(uint256 indexed planId, address indexed subscriber);
    event SubscriptionExpired(uint256 indexed planId, address indexed subscriber);

    constructor(address token) {
        require(token.code.length > 0, "INVALID_TOKEN");
        paymentToken = token;
    }

    modifier nonReentrant() { require(!_locked, "REENTRANCY"); _locked = true; _; _locked = false; }

    function createPlan(string calldata name, string calldata description, uint96 price, uint32 interval, uint32 duration) external returns (uint256 planId) {
        require(bytes(name).length > 0 && bytes(name).length <= 80, "INVALID_NAME");
        require(bytes(description).length <= 280, "DESCRIPTION_TOO_LONG");
        require(price > 0 && interval > 0, "INVALID_PLAN");
        require(duration == 0 || duration >= interval, "INVALID_DURATION");
        planId = nextPlanId++;
        _plans[planId] = Plan(msg.sender, paymentToken, price, interval, duration, true, name, description);
        _merchantPlanIds[msg.sender].push(planId);
        emit PlanCreated(planId, msg.sender, paymentToken, price, interval, duration, name, description);
    }

    function setPlanActive(uint256 planId, bool active) external {
        Plan storage plan = _plans[planId];
        require(plan.merchant != address(0), "PLAN_NOT_FOUND");
        require(msg.sender == plan.merchant, "NOT_MERCHANT");
        plan.active = active;
        emit PlanStatusChanged(planId, active);
    }

    function subscribe(uint256 planId) external nonReentrant {
        Plan memory plan = _plans[planId];
        require(plan.merchant != address(0) && plan.active, "PLAN_INACTIVE");
        require(!_subscriptions[msg.sender][planId].active, "ALREADY_SUBSCRIBED");
        uint64 nowTime = uint64(block.timestamp);
        uint64 nextDue = nowTime + plan.interval;
        uint64 expiry = plan.duration == 0 ? 0 : nowTime + plan.duration;
        _safeTransferFrom(plan.token, msg.sender, plan.merchant, plan.price);
        Subscription storage subscription = _subscriptions[msg.sender][planId];
        subscription.planId = uint64(planId);
        subscription.startedAt = nowTime;
        subscription.nextPayment = nextDue;
        subscription.expiresAt = expiry;
        subscription.totalPaid += plan.price;
        subscription.active = true;
        if (!_hasSubscribed[msg.sender][planId]) {
            _hasSubscribed[msg.sender][planId] = true;
            _subscriberPlanIds[msg.sender].push(planId);
            _planSubscribers[planId].push(msg.sender);
        }
        emit Subscribed(planId, msg.sender, nextDue, expiry);
        emit PaymentExecuted(planId, msg.sender, plan.merchant, plan.price, nextDue);
    }

    function executePayment(address subscriber, uint256 planId) external nonReentrant {
        Plan memory plan = _plans[planId];
        Subscription storage subscription = _subscriptions[subscriber][planId];
        require(plan.active && subscription.active, "NOT_ACTIVE");
        require(block.timestamp >= subscription.nextPayment, "NOT_DUE");
        if (subscription.expiresAt != 0 && block.timestamp >= subscription.expiresAt) {
            subscription.active = false;
            emit SubscriptionExpired(planId, subscriber);
            return;
        }
        _safeTransferFrom(plan.token, subscriber, plan.merchant, plan.price);
        subscription.nextPayment = uint64(block.timestamp + plan.interval);
        subscription.totalPaid += plan.price;
        emit PaymentExecuted(planId, subscriber, plan.merchant, plan.price, subscription.nextPayment);
    }

    function cancel(uint256 planId) external {
        Subscription storage subscription = _subscriptions[msg.sender][planId];
        require(subscription.active, "NOT_ACTIVE");
        subscription.active = false;
        emit SubscriptionCanceled(planId, msg.sender);
    }

    function getPlan(uint256 planId) external view returns (Plan memory) { return _plans[planId]; }
    function getSubscription(address subscriber, uint256 planId) external view returns (Subscription memory) { return _subscriptions[subscriber][planId]; }
    function getMerchantPlanIds(address merchant) external view returns (uint256[] memory) { return _merchantPlanIds[merchant]; }
    function getSubscriberPlanIds(address subscriber) external view returns (uint256[] memory) { return _subscriberPlanIds[subscriber]; }
    function getSubscriberPlanCount(address subscriber) external view returns (uint256) { return _subscriberPlanIds[subscriber].length; }
    function getSubscriberPlanIdsPage(address subscriber, uint256 offset, uint256 limit) external view returns (uint256[] memory page) {
        require(limit > 0 && limit <= 100, "INVALID_PAGE_SIZE");
        uint256[] storage entries = _subscriberPlanIds[subscriber];
        if (offset >= entries.length) return new uint256[](0);
        uint256 size = entries.length - offset;
        if (size > limit) size = limit;
        page = new uint256[](size);
        for (uint256 i; i < size; i++) page[i] = entries[offset + i];
    }
    function getPlanSubscribers(uint256 planId) external view returns (address[] memory) { return _planSubscribers[planId]; }
    function getPlanSubscriberCount(uint256 planId) external view returns (uint256) { return _planSubscribers[planId].length; }
    function getPlanSubscribersPage(uint256 planId, uint256 offset, uint256 limit) external view returns (address[] memory page) {
        require(limit > 0 && limit <= 100, "INVALID_PAGE_SIZE");
        address[] storage entries = _planSubscribers[planId];
        if (offset >= entries.length) return new address[](0);
        uint256 size = entries.length - offset;
        if (size > limit) size = limit;
        page = new address[](size);
        for (uint256 i; i < size; i++) page[i] = entries[offset + i];
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        (bool success, bytes memory result) = token.call(abi.encodeCall(IERC20.transferFrom, (from, to, amount)));
        require(success && (result.length == 0 || abi.decode(result, (bool))), "PAYMENT_FAILED");
    }
}
