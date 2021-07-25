const {getColor} = require("../src/colors");
const {levels} = require("./levels");

describe("getColors", () => {
    it.each(levels)("There's a value for level %s", (level) => {
        const color = getColor(level);
        expect(color).toBeTruthy();
    })
});
