var app = angular.module('app', []);
var LiveApi = window['binary-live-api'].LiveApi;

app.controller('BinaryController', ['$scope', function($scope) {

    var _self = this;
    var api = new LiveApi({
        appId: '11588'
    });

    function checkSignal(second, candle) {
        if (second == 58) {
            var tradeType = '';
            if (candle.close > $scope.bb[1]) {
                $scope.signal = (candle.close - $scope.bb[1]).toFixed(2);
                tradeType = 'PUT';
            }
            if ($scope.bb[2] > candle.close) {
                $scope.signal = ($scope.bb[2] - candle.close).toFixed(2);
                tradeType = 'CALL';
            }
            if (tradeType != '' && $scope.isAuto() && $scope.canTrade()) {
                $scope.buyContractForDuration(tradeType, 59);
            }
            setTimeout(function () {
                if ($scope.signal) {
                    $scope.signal = undefined;
                    $scope.$apply();
                }
            }, 8000);
        }
    }

    function sendNotification(second, candle, delta) {
        var body = second + 's --> ' + (Math.abs(candle.close - $scope.bb[1]) <= delta ? 'PUT' : 'CALL');
        var image = Math.abs(candle.close - $scope.bb[1]) <= delta ? 'img/put.png' : 'img/call.png';
        if (!$scope.notification) {
            $scope.notification = new Notification('Notification for ' + $scope.config.symbol, {
                icon: 'https://www.binary.com/images/favicons/favicon-96x96.png',
                image: image,
                body: body
            });
            $scope.notification.onclick = function () {
                window.focus();
                $scope.notification.close();
            };
            $scope.notification.onclose = function () {
                $scope.notification = undefined;
            };
            setTimeout(function () {
                if ($scope.notification) {
                    $scope.notification.close();
                }
            }, 8000);
        }
    }

    function getTodayTradeResult() {
        api.getProfitTable({
            description: 1,
            date_from: moment().format('YYYY-MM-DD'),
            date_to: moment().format('YYYY-MM-DD'),
        }).then(function(data) {
            var transactions = data.profit_table.transactions;
            for (var i = 0; i < transactions.length; i++) {
                var trans = transactions[i];
                var profit = trans.sell_price - trans.buy_price;
                $scope.profit += profit;
                $scope.contracts.push({
                    contract_id: trans.contract_id,
                    purchase_time: trans.purchase_time,
                    contract_type: trans.shortcode.includes('PUT') ? 'PUT' : 'CALL',
                    status: profit > 0 ? 'won' : 'lost',
                    payout: trans.payout,
                    buy_price: trans.buy_price
                });
            }
            $scope.$apply();
        });
    }

    function processContractResult(contract) {
        if (contract.status == 'won') {
            $scope.profit += contract.payout - contract.buy_price;
            $scope.level = 1;
        }
        if (contract.status == 'lost') {
            $scope.profit -= contract.buy_price;
            $scope.level++;
            if ($scope.level > 4) {
                $scope.level = 1;
            }
        }
        $scope.profit = +$scope.profit.toFixed(2);
        if ($scope.level == 1) {
            $scope.stake = +$scope.config.initStake;
        }
        if ($scope.level == 2 || $scope.level == 3) {
            $scope.stake = +(contract.payout / $scope.profitRatio).toFixed(2);
        }
    }

    api.ping().then(function () {
        $scope.status = 'Connected';
        $scope.$apply();
    });

    api.events.on('ohlc', function(data) {
        var ohlc = data.ohlc;
        var lastCandle = $scope.candles[$scope.candles.length - 1];
        var candle = {
            open: Number(ohlc.open),
            close: Number(ohlc.close),
            high: Number(ohlc.high),
            low: Number(ohlc.low),
            time: Number(ohlc.open_time)
        };

        var second = ohlc.epoch - ohlc.open_time;

        if (candle.time == lastCandle.time) {
            $scope.candles[$scope.candles.length - 1] = candle;
        } else {
            $scope.candles.push(candle);
        }
        $scope.bb = calculateBB($scope.candles, {
            periods: 20,
            pipSize: 4,
            stdDevUp: 2.4,
            stdDevDown: 2.4,
            field: 'close',
        });

        var delta = 1;

        if (Math.abs(candle.close - $scope.bb[1]) <= delta || Math.abs(candle.close - $scope.bb[2]) <= delta) {
            if (second >= 40) {
                sendNotification(second, candle, delta);
            }
        }
        checkSignal(second, candle);
        $scope.second = second;
        $scope.$apply();
    });

    api.events.on('balance', function(data) {
        var balance = data.balance;
        $scope.balance = balance.balance;
        $scope.loginid = balance.loginid;
        $scope.$apply();
    });

    api.events.on('proposal_open_contract', function (data) {
        var contract = data.proposal_open_contract;
        if ($scope.contracts.length > 0 && $scope.contracts[0].contract_id == contract.contract_id) {
            $scope.contracts[0] = contract;
        } else if (contract.contract_id) {
            $scope.contracts.unshift(contract);
        }
        if (contract.status != 'open') {
            processContractResult(contract);
        }
        $scope.$apply();
    });

    $scope.candles = [];
    $scope.contracts = [];
    $scope.status = 'Initing...';
    $scope.bb = {};
    $scope.level = 1;
    $scope.profit = 0;
    $scope.config = {
        symbol: 'R_100',
        initStake: 1,
        duration: 59,
        auto: false,
        wait: 9,
    };

    $scope.isAuto = function () {
        return $scope.config.auto;
    };

    $scope.canTrade = function () {
        if ($scope.contracts.length == 0 || $scope.contracts[0].status == 'won') {
            return true;
        }
        var now = new Date().getTime() / 1000;
        return ($scope.contracts[0].status == 'lost' && now - $scope.contracts[0].purchase_time >= $scope.config.wait * 60);
    };

    var token = Cookies.get('config.token');
    if (token) {
        $scope.config.token = token;
    }

    $scope.lastCandle = function() {
        return $scope.candles[$scope.candles.length - 1];
    };

    $scope.formatTime = function (timestamp) {
        return moment.unix(timestamp).format('DD.MM.YYYY HH:mm:ss');
    };

    $scope.getProfit = function (contract) {
        if (contract.status == 'lost') {
            return '$' + contract.buy_price;
        }
        if (contract.status == 'won') {
            return '$' + (contract.payout - contract.buy_price).toFixed(2);
        }
        if (contract.status == 'open') {
            //var diff = contract.current_spot - contract.barrier;
            //return '$' + Math.abs(diff).toFixed(2);
            return '$' + Math.abs(contract.bid_price - contract.buy_price).toFixed(2);
        }
    };

    $scope.isWinning = function (contract) {
        var type = contract.contract_type == 'CALL' ? 1 : -1;
        var diff = contract.current_spot - contract.barrier;
        return type * diff > 0;
    };

    $scope.getContractStatusBackground = function (contract) {
        if (contract.status == 'open') {
            return $scope.isWinning(contract) ? 'bg-primary' : 'bg-danger';
        } else {
            return '';
        }
    };

    $scope.getContractStatusColor = function (contract) {
        if (contract.status == 'open') {
            return 'text-white';
        }
        if (contract.status == 'won') {
            return 'text-success';
        }
        if (contract.status == 'lost') {
            return 'text-danger';
        }
    };

    $scope.getTimeout = function (contract) {
        if (contract.status == 'open') {
            return ' (' + (contract.date_expiry - contract.current_spot_time) + ')';
        }
        return '';
    };

    $scope.authorize = function () {
        $scope.status = 'Authorizing';
        Cookies.set('config.token', $scope.config.token);
        api.authorize($scope.config.token).then(function(data) {
            if (data.authorize.loginid.includes('VRTC')) {
                $scope.config.initStake = 10;
                $scope.config.auto = true;
            }
            $scope.status = 'Authorized';
            $scope.stake = +$scope.config.initStake;
            $scope.$apply();
            $scope.getData();
            getTodayTradeResult();
            api.subscribeToBalance();
            api.getPriceProposalForContract({
                amount: +$scope.config.initStake,
                basis: 'stake',
                contract_type: 'CALL',
                currency: 'USD',
                duration: '60',
                duration_unit: 's',
                symbol: $scope.config.symbol
            }).then(function (data) {
                var proposal = data.proposal;
                $scope.profitRatio = (proposal.payout - $scope.config.initStake) / $scope.config.initStake;
            });
        });
    };

    $scope.isAuthorizing = function () {
        return $scope.status == 'Authorizing';
    };

    $scope.isAuthorized = function () {
        return $scope.status == 'Authorized';
    };

    $scope.potentialProfit = function () {
        return ($scope.profitRatio * $scope.stake).toFixed(2);
    };

    $scope.buyContract = function (type) {
        $scope.buyContractForDuration(type, $scope.config.duration);
    };

    $scope.buyContractInCandle = function (type) {
        var duration = 59 - 2 - $scope.second;
        if (duration >= 15) {
            $scope.buyContractForDuration(type, duration);
        }
    };

    $scope.buyContractForDuration = function (type, duration) {
        api.buyContractParams({
            amount: $scope.stake,
            basis: 'stake',
            contract_type: type,
            currency: 'USD',
            symbol: $scope.config.symbol,
            duration: duration,
            duration_unit: 's'
        }, $scope.stake).then(function (data) {
            var buy = data.buy;
            api.subscribeToOpenContract(buy.contract_id);
        });
    };

    $scope.getData = function() {
        api.getCandles($scope.config.symbol, {end: 'latest', count: 50, granularity: 60, subscribe: 1}).then(function(data) {
            var candles = data.candles;
            for (var i = 0; i < candles.length; i++) {
                $scope.candles.push({
                    open: Number(candles[i].open),
                    close: Number(candles[i].close),
                    high: Number(candles[i].high),
                    low: Number(candles[i].low),
                    time: Number(candles[i].epoch)
                });
            }
        });
    };

}]);

var windowHeight = $(window.top).height();
$('#tradingview').height(windowHeight - 20);
$('#tradingview').attr('src', 'https://tradingview.binary.com/v1.3.10/main.html');