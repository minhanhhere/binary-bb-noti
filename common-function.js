function sum(data) {
    return data.reduce(function(acc, x) {
        return acc + x;
    });
}

function mean(data) {
    return data.reduce(function (a, b) {
            return a + b;
        }) / data.length;
}

function stddev(data) {
    var dataMean = mean(data);
    var sqDiff = data.map(function (n) {
        return Math.pow(n - dataMean, 2);
    });
    var avgSqDiff = mean(sqDiff);
    return Math.sqrt(avgSqDiff);
}

function takeField(arr, field) {
    return arr.map(function(x) {
        return field ? x[field] : x;
    });
}

function takeLast(arr, n, field) {
    return takeField(arr.slice(n > arr.length ? 0 : arr.length - n, arr.length), field);
}

function simpleMovingAverage(data, config) {
    var vals = takeLast(data, config.periods, config.field);
    return sum(vals) / config.periods;
}

function calculateBB(data, config) {
    var vals = takeLast(data, config.periods, config.field);
    var middle = simpleMovingAverage(vals, { periods: config.periods });
    var stdDev = stddev(vals);
    var upper = middle + stdDev * config.stdDevUp;
    var lower = middle - stdDev * config.stdDevDown;
    return [+middle.toFixed(config.pipSize), +upper.toFixed(config.pipSize), +lower.toFixed(config.pipSize)];
}