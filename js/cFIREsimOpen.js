$(document).ready(function() {
    $("#runSim").click(function() {
        Simulation.sim = [];
        Simulation.runSimulation(formData);
    });
});

var Simulation = {
    sim: [],
    runSimulation: function(form) {
        console.log("Form Data:", form);
        this.sim = []; //Deletes previous simulation values if they exist.
        var startYear = new Date().getFullYear();
        var endYear = form.retirementEndYear;
        var cycleLength = endYear - startYear + 1;
        var numCycles = Object.keys(Market).length - cycleLength + 1;

        for (var cycleStart = 1871; cycleStart < 1871 + numCycles; cycleStart++) {
            var cyc = this.cycle(cycleStart, cycleStart + cycleLength);
            this.sim.push(cyc);
        }
        for (var i = 0; i < this.sim.length; i++) {
            for (var j = 0; j < this.sim[i].length; j++) {
                this.calcStartPortfolio(form, i, j); //Return Starting portfolio value to kick off yearly simulation cycles
                this.calcSpending(form, i, j); //Nominal spending for this specific cycle
                this.calcMarketGains(form, i, j); //Calculate market gains on portfolio based on allocation from form and data points
                this.calcEndPortfolio(form, i, j); //Sum up ending portfolio
            }
        }
        console.log("Results:", this.sim);

        //Run post-simulation functions
        this.convertToCSV(this.sim);
        this.calcFailures(this.sim);
        this.displayGraph(this.sim);

        //Initialize statistics calculations
        StatsModule.init(this.sim);
    },
    cycle: function(startOfRange, endOfRange) {
        //The starting CPI value of this cycle, for comparison throughout the cycle.
        var startCPI = Market[startOfRange.toString()].cpi;
        var cyc = [];

        for (var year = startOfRange; year < endOfRange; year++) {
            data = Market[year.toString()];
            cyc.push({
                "year": year,
                "data": data,
                "portfolio": {
                    "start": null,
                    "end": null,
                    "infAdjStart": null,
                    "infAdjEnd": null,
                    "fees": null
                },
                "spending": null,
                "infAdjSpending": null,
                "equities": {
                    "start": null,
                    "growth": null,
                    "val": null
                },
                "bonds": {
                    "start": null,
                    "growth": null,
                    "val": null
                },
                "gold": {
                    "start": null,
                    "growth": null,
                    "val": null
                },
                "cash": {
                    "start": null,
                    "growth": null,
                    "val": null
                },
                "dividends": {
                    "growth": null,
                    "val": null
                },
                "cumulativeInflation": this.cumulativeInflation(startCPI, data.cpi),
                "sumOfAdjustments": null,
            });
        }

        return cyc;

    },
    roundTwoDecimals: function(num) {
        return Math.ceil(num * 100) / 100;
    },
    cumulativeInflation: function(startCPI, endCPI) {
        return 1 + ((endCPI - startCPI) / startCPI);
    },
    calcStartPortfolio: function(form, i, j) {
        if (j > 0) {
            this.sim[i][j].portfolio.start = this.roundTwoDecimals(this.sim[i][(j - 1)].portfolio.end);
        } else {
            this.sim[i][j].portfolio.start = this.roundTwoDecimals(form.portfolio.initial);
        }
        this.sim[i][j].portfolio.infAdjStart = this.roundTwoDecimals(this.sim[i][j].portfolio.start * this.sim[i][j].cumulativeInflation);
    },
    calcSpending: function(form, i, j) {
        var spending;
        var currentYear = new Date().getFullYear();
        if (j >= (form.retirementStartYear - currentYear)) {
            spending = SpendingModule[form.spending.method].calcSpending(form, this.sim, i, j);
        }

        this.sim[i][j].spending = spending; //assign value to main sim container
        this.sim[i][j].infAdjSpending = this.roundTwoDecimals(spending / this.sim[i][j].cumulativeInflation);
    },
    calcMarketGains: function(form, i, j) {
        var portfolio = this.sim[i][j].portfolio.start;
        portfolio = portfolio - this.sim[i][j].spending; //Take out spending before calculating asset allocation. This simulates taking your spending out at the beginning of a year.

        //Calculate value of each asset class based on allocation percentages
        var equities = (form.portfolio.percentEquities / 100 * portfolio);
        var bonds = (form.portfolio.percentBonds / 100 * portfolio);
        var gold = (form.portfolio.percentGold / 100 * portfolio);
        var cash = (form.portfolio.percentCash / 100 * portfolio);
        this.sim[i][j].equities.start = equities;
        this.sim[i][j].bonds.start = bonds;
        this.sim[i][j].gold.start = gold;
        this.sim[i][j].cash.start = cash;

        //Calculate growth
        this.sim[i][j].equities.growth = this.roundTwoDecimals(equities * (this.sim[i][j].data.growth));
        this.sim[i][j].dividends.growth = this.roundTwoDecimals(equities * this.sim[i][j].data.dividends);

        //New Bond Calculation to incorporate capital appreciation. 
        if (typeof(Market[this.sim[i][j].year + 1]) == "undefined") {
            this.sim[i][j].bonds.growth = this.roundTwoDecimals(bonds * (this.sim[i][j].data.fixed_income));
        } else {
            var bondsGrowth1 = (this.sim[i][j].data.fixed_income) * (1 - (Math.pow((1 + Market[this.sim[i][j].year + 1].fixed_income), (-9)))) / Market[this.sim[i][j].year + 1].fixed_income;
            var bondsGrowth2 = (1 / (Math.pow((1 + Market[this.sim[i][j].year + 1].fixed_income), 9))) - 1;
            this.sim[i][j].bonds.growth = this.roundTwoDecimals(bonds * (bondsGrowth1 + bondsGrowth2 + this.sim[i][j].data.fixed_income));
        }

        this.sim[i][j].gold.growth = this.roundTwoDecimals(gold * (this.sim[i][j].data.gold));
        this.sim[i][j].cash.growth = this.roundTwoDecimals(cash * ((form.portfolio.growthOfCash / 100)));

        //Calculate total value
        this.sim[i][j].equities.end = this.roundTwoDecimals(equities + this.sim[i][j].equities.growth + this.sim[i][j].dividends.growth);
        this.sim[i][j].dividends.val = this.sim[i][j].dividends.growth;
        this.sim[i][j].bonds.end = this.roundTwoDecimals(bonds + this.sim[i][j].bonds.growth);
        this.sim[i][j].gold.end = this.roundTwoDecimals(gold + this.sim[i][j].gold.growth);
        this.sim[i][j].cash.end = this.roundTwoDecimals(cash + this.sim[i][j].cash.growth);

    },
    calcEndPortfolio: function(form, i, j) {
        if (form.portfolio.rebalanceAnnually == true) {
            var feesIncurred = this.roundTwoDecimals((this.sim[i][j].portfolio.start - this.sim[i][j].spending + this.sim[i][j].equities.growth + this.sim[i][j].bonds.growth + this.sim[i][j].cash.growth + this.sim[i][j].gold.growth) * (form.portfolio.percentFees / 100));
            this.sim[i][j].portfolio.fees = feesIncurred;
            var sumOfAdjustments = this.calcSumOfAdjustments(form, i, j); //Sum of all portfolio adjustments for this given year. SS/Pensions/Extra Income/Extra Spending.

            //Calculate current allocation percentages after all market gains are taken into consideration
            var curPercEquities = this.sim[i][j].equities.end / (this.sim[i][j].equities.end + this.sim[i][j].bonds.end + this.sim[i][j].cash.end + this.sim[i][j].gold.end);
            var currPercCash = this.sim[i][j].cash.end / (this.sim[i][j].equities.end + this.sim[i][j].bonds.end + this.sim[i][j].cash.end + this.sim[i][j].gold.end);
            var currPercBonds = this.sim[i][j].bonds.end / (this.sim[i][j].equities.end + this.sim[i][j].bonds.end + this.sim[i][j].cash.end + this.sim[i][j].gold.end);
            var currPercGold = this.sim[i][j].gold.end / (this.sim[i][j].equities.end + this.sim[i][j].bonds.end + this.sim[i][j].cash.end + this.sim[i][j].gold.end);

            //Equally distribute fees and portoflio adjustments amongst portfolio based on allocation percentages
            this.sim[i][j].equities.end = this.roundTwoDecimals(this.sim[i][j].equities.end + (curPercEquities * sumOfAdjustments) - (curPercEquities * feesIncurred));
            this.sim[i][j].cash.end = this.roundTwoDecimals(this.sim[i][j].cash.end + (currPercCash * sumOfAdjustments) - (currPercCash * feesIncurred));
            this.sim[i][j].bonds.end = this.roundTwoDecimals(this.sim[i][j].bonds.end + (currPercBonds * sumOfAdjustments) - (currPercBonds * feesIncurred));
            this.sim[i][j].gold.end = this.roundTwoDecimals(this.sim[i][j].gold.end + (currPercGold * sumOfAdjustments) - (currPercGold * feesIncurred));

            //Sum all assets to determine portfolio end value.
            this.sim[i][j].portfolio.end = this.roundTwoDecimals(this.sim[i][j].equities.end + this.sim[i][j].bonds.end + this.sim[i][j].cash.end + this.sim[i][j].gold.end);
            this.sim[i][j].portfolio.infAdjEnd = this.roundTwoDecimals(this.sim[i][j].portfolio.end * this.sim[i][j].cumulativeInflation);

        } else { //Add logic for non-rebalancing portfolios

        }
    },
    calcFailures: function(results) {
        var totalFailures = 0;
        for (var i = 0; i < results.length; i++) {
            var cycleFailure = false;
            for (var j = 0; j < results[i].length; j++) {
                if (results[i][j].portfolio.end < 0) {
                    cycleFailure = true;
                }
            }
            if (cycleFailure == true) {
                totalFailures++;
            }
        }
        console.log("Failed " + totalFailures + " out of " + results.length + " cycles.");
    },
    calcSumOfAdjustments: function(form, i, j) {
        var currentYear = new Date().getFullYear();
        var sumOfAdjustments = 0;
        //Evaluate ExtraIncome given cycle i, year j
        //Social Security - always adjusted by CPI
        if ((j >= (form.extraIncome.socialSecurity.startYear - currentYear)) && (j <= (form.extraIncome.socialSecurity.endYear - currentYear))) {
            sumOfAdjustments += (form.extraIncome.socialSecurity.val * this.sim[i][j].cumulativeInflation);
        }
        if ((j >= (form.extraIncome.socialSecuritySpouse.startYear - currentYear)) && (j <= (form.extraIncome.socialSecuritySpouse.endYear - currentYear))) {
            sumOfAdjustments += (form.extraIncome.socialSecuritySpouse.val * this.sim[i][j].cumulativeInflation);
        }

        //Pensions
        for (var k = 0; k < form.extraIncome.pensions.length; k++) {
            if ((j >= (form.extraIncome.pensions[k].startYear - currentYear))) {
                sumOfAdjustments += this.calcAdjustmentVal(form.extraIncome.pensions[k], i, j);
            }
        }

        //Extra Savings
        for (var k = 0; k < form.extraIncome.extraSavings.length; k++) {
            if ((j >= (form.extraIncome.extraSavings[k].startYear - currentYear)) && (j <= (form.extraIncome.extraSavings[k].endYear - currentYear))) {
                sumOfAdjustments += this.calcAdjustmentVal(form.extraIncome.extraSavings[k], i, j);
            }
        }

        //Evaluate ExtraSpending
        for (var k = 0; k < form.extraSpending.length; k++) {
            if ((j >= (form.extraSpending[k].startYear - currentYear)) && (j <= (form.extraSpending[k].endYear - currentYear))) {
                sumOfAdjustments -= this.calcAdjustmentVal(form.extraSpending[k], i, j);
            }
        }

        //Add sumOfAdjustments to sim container and return value.
        this.sim[i][j].sumOfAdjustments = sumOfAdjustments;
        return sumOfAdjustments;
    },
    calcAdjustmentVal: function(adj, i, j) {
        //Take in parameter of a portfolio adjustment object, return correct inflation-adjusted amount based on object parameters
        if (adj.inflationType == "CPI") {
            return (adj.val * this.sim[i][j].cumulativeInflation);
        } else if (adj.inflationType == "constant") {
            var percentage = 1 + (adj.inflationRate / 100);
            return (adj.val * Math.pow(percentage, (j + 1)));
        }
    },
    displayGraph: function(results) {
        var chartData = [];
        var interval = results.length;
        var cycLength = results[0].length - 1;
        var simLength = results.length + cycLength;

        //Logic to create array for Dygraphs display. Each series must have an entry for every year in the dataset. If there is no entry for that year in the "results" array, a null value is given so that dygraphs doesn't plot there. This provides the unique look of cFIREsims graph
        for (var i = 0; i < simLength; i++) {
            chartData[i] = [];
            for (var j = 0; j < simLength; j++) {
                chartData[i].push(null);
            }
        }
        var interval = results[0].length;
        for (var a = 0; a < simLength; a++) {
            for (var i = 0; i < results.length; i++) {
                for (var b = 0; b < interval; b++) {
                    if (results[i][b].year == (a + results[0][0].year)) {
                        chartData[a][i] = results[i][b].portfolio.infAdjEnd;
                    }
                }
            }
        }
        for (var i = 0; i < simLength; i++) { // Add year to the front of each series array. This is a Dygraphs format standard
            chartData[i].unshift((i + results[0][0].year));
        }

        //Chart Formatting - Dygraphs
        var labels = ['x'];
        for (var i = 0; i < simLength; i++) {
            var labelyear = i + results[0][0].year;
            var label = '';
            label = 'Cycle Start Year: ' + labelyear;
            labels[i + 1] = label;
        }
        g = new Dygraph(
            // containing div
            document.getElementById("graphdiv"),
            // CSV or path to a CSV file.
            chartData, {
                labels: labels.slice(),
                title: 'cFIREsim Simulation Cycles',
                ylabel: 'Portfolio ($)',
                xlabel: 'Year',
                labelsDivStyles: {
                    'textAlign': 'right'
                },
                labelsDivWidth: 500,
                labelsDiv: 'labelsdiv',
                digitsAfterDecimal: 0,
                axes: {
                    y: {
                        axisLabelWidth: 100,
                        labelsKMB: false,
                        maxNumberWidth: 11,
                        valueFormatter: function numberWithCommas(x) {
                            return 'Portfolio: $' + x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                        },
                        axisLabelFormatter: function numberWithCommas(x) {
                            return '$' + x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                        }
                    },
                    x: {
                        valueFormatter: function numberWithCommas(x) {
                            return 'Selected Year: ' + x;
                        },
                    },
                },
                showLabelsOnHighlight: true,
                highlightCircleSize: 3,
                strokeWidth: 1.5,
                strokeBorderWidth: 0,
                highlightSeriesBackgroundAlpha: 1.0,
                highlightSeriesOpts: {
                    strokeWidth: 4,
                    strokeBorderWidth: 2,
                    highlightCircleSize: 5,
                },
            }
        );
    },
    convertToCSV: function (results){ //converts a random cycle of simulation into a CSV file, for users to easily view
        var csv = "";
        function getRandomInt(min, max) {
          return Math.floor(Math.random() * (max - min)) + min;
        }
        var num = getRandomInt(0, results.length);
        csv = csv.concat("Year,CumulativeInflation,portfolio.start,portfolio.infAdjStart,spending,infAdjSpending,PortfolioAdjustments,Equities,Bonds,Gold,Cash,equities.growth,dividends,bonds.growth,gold.growth,cash.growth,fees,portfolio.end,portfolio.infAdjEnd\r\n");
        for(var i = 0; i< results[num].length; i++){
            csv = csv.concat(results[num][i].year + ",");
            csv = csv.concat(results[num][i].cumulativeInflation + ",");
            csv = csv.concat(results[num][i].portfolio.start + ",");
            csv = csv.concat(results[num][i].portfolio.infAdjStart + ",");
            csv = csv.concat(results[num][i].spending + ",");
            csv = csv.concat(results[num][i].infAdjSpending + ",");
            csv = csv.concat(results[num][i].sumOfAdjustments + ",");
            csv = csv.concat(results[num][i].equities.start + ",");
            csv = csv.concat(results[num][i].bonds.start + ",");
            csv = csv.concat(results[num][i].gold.start + ",");
            csv = csv.concat(results[num][i].cash.start + ",");
            csv = csv.concat(results[num][i].equities.growth + ",");
            csv = csv.concat(results[num][i].dividends.growth + ",");
            csv = csv.concat(results[num][i].bonds.growth + ",");
            csv = csv.concat(results[num][i].gold.growth + ",");
            csv = csv.concat(results[num][i].cash.growth + ",");
            csv = csv.concat(results[num][i].portfolio.fees + ",");
            csv = csv.concat(results[num][i].portfolio.end + ",");
            csv = csv.concat(results[num][i].portfolio.infAdjEnd + ",");
            csv = csv.concat("\r\n");
        }
        var uri = 'data:text/csv;charset=utf-8,' + escape(csv);
        // Now the little tricky part.
        // you can use either>> window.open(uri);
        // but this will not work in some browsers
        // or you will not get the correct file extension    
        
        //this trick will generate a temp <a /> tag
        var link = document.createElement("a"); 
        var linkText = document.createTextNode("download CSV"); 
        link.title = "download CSV"; 
        link.appendChild(linkText); 
        link.href = uri;
        
        //set the visibility hidden so it will not effect on your web-layout
        //link.style = "visibility:hidden";
        link.download = "cfiresim.csv";
        
        //this part will append the anchor tag and remove it after automatic click
        document.body.appendChild(link);
        //link.click();
        //document.body.removeChild(link);
    }
};
