const COLORS = {
    error: "#dc3545",
    warn: "#ffc107",
    info: "#0dcaf0",
    http: "#adb5bd",
    verbose: "#495057",
    debug: "#343a40",
    silly: "#000"
};

const getColor = (level) => COLORS[level];

exports.getColor = getColor;
