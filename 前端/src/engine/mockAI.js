export const mockAI = {
    generateOptions: (state) => {
        const { cash, morale, reputation, innovation } = state.attributes;
        const options = [];

        // Basic Logic for generating options
        if (cash < 500) {
            options.push({
                id: 'fundraise',
                label: "紧急融资",
                description: "出让股份以换取急需的现金。",
                effects: { cash: 500, reputation: -10, morale: -5 },
                resultNarrative: "投资者同意了注资，但他们对公司的控制权提出了要求。"
            });
        } else {
            options.push({
                id: 'marketing',
                label: "全面营销",
                description: "由于资金充足，发动一场大规模的市场战役。",
                effects: { cash: -300, reputation: 15 },
                resultNarrative: "广告铺天盖地，品牌知名度显著提升。"
            });
        }

        if (morale < 40) {
            options.push({
                id: 'teambuilding',
                label: "团建活动",
                description: "士气低落，组织一次外出团建。",
                effects: { cash: -100, morale: 20 },
                resultNarrative: "团队在活动中重拾了凝聚力，工作氛围有所好转。"
            });
        } else {
            options.push({
                id: 'overtime',
                label: "赶工研发",
                description: "趁着士气高昂，要求团队加班推进新产品。",
                effects: { morale: -10, innovation: 15 },
                resultNarrative: "新功能提前上线，但员工们显得有些疲惫。"
            });
        }

        // Always valid option
        options.push({
            id: 'consult',
            label: "咨询顾问",
            description: "聘请外部专家评估现状。",
            effects: { cash: -50, innovation: 5 },
            resultNarrative: "顾问提供了一些新颖的见解，虽然昂贵但值得。"
        });

        return options.slice(0, 3); // Return max 3
    },

    analyzeInput: (input, state) => {
        // Determine effects for custom input (simulated NLP)
        const lowerInput = input.toLowerCase();

        let effects = { cash: 0, morale: 0, reputation: 0, innovation: 0 };
        let narrative = "系统记录了你的决策，正在评估市场反馈...";

        if (lowerInput.includes("invest") || lowerInput.includes("投资")) {
            effects.cash = -200;
            effects.innovation = 10;
            narrative = "你将资金投入到新项目中，研发部门对此感到兴奋。";
        } else if (lowerInput.includes("fire") || lowerInput.includes("裁员")) {
            effects.cash = 100; // Save money
            effects.morale = -20;
            effects.reputation = -10;
            narrative = "裁员决定引起了恐慌，办公室里弥漫着不安的气氛。";
        } else if (lowerInput.includes("party") || lowerInput.includes("庆祝")) {
            effects.cash = -100;
            effects.morale = 15;
            narrative = "庆祝活动很成功，大家都很开心。";
        } else {
            // Default generic effect
            effects.cash = -10;
            narrative = "你的决策已被执行，市场反应平平。";
        }

        return {
            effects,
            resultNarrative: narrative
        };
    }
};
