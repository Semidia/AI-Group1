from models import GameState, GameAttributes, GameHistoryEntry, GameOption, PlayerAction
import time

INITIAL_STATE = GameState(
    companyName="Nexus Corp",
    turn=1,
    attributes=GameAttributes(
        cash=1000,
        morale=50,
        reputation=50,
        innovation=10
    ),
    history=[
        GameHistoryEntry(
            id=0,
            type="system",
            text="欢迎来到《凡墙皆是门》。你已被任命为 Nexus Corp 的首席执行官。公司正处于十字路口，你的每一个决定都至关重要。"
        )
    ]
)

def process_decision(state: GameState, action: PlayerAction) -> GameState:
    # Deep copy attributes to avoid mutation issues (though Pydantic is immutable by default, we create new)
    new_attrs = state.attributes.model_copy()
    
    # Apply effects
    if action.effects:
        if "cash" in action.effects: new_attrs.cash += action.effects["cash"]
        if "morale" in action.effects: new_attrs.morale += action.effects["morale"]
        if "reputation" in action.effects: new_attrs.reputation += action.effects["reputation"]
        if "innovation" in action.effects: new_attrs.innovation += action.effects["innovation"]

    # Bounds checking
    new_attrs.morale = max(0, min(100, new_attrs.morale))
    new_attrs.reputation = max(0, min(100, new_attrs.reputation))

    # Generate result text
    result_text = f"你决定：{action.customText}。" if action.customText else f"执行了计划：{action.label}。"

    # Update history
    new_history = state.history.copy()
    new_history.append(GameHistoryEntry(
        id=int(time.time() * 1000),
        type="player",
        text=result_text
    ))
    new_history.append(GameHistoryEntry(
        id=int(time.time() * 1000) + 1,
        type="system",
        text=action.resultNarrative or "由于你的决策，局势发生了变化。"
    ))

    return GameState(
        companyName=state.companyName,
        turn=state.turn + 1,
        attributes=new_attrs,
        history=new_history
    )

class MockAI:
    _init_settings = ""
    
    @classmethod
    def set_init_settings(cls, settings: str):
        cls._init_settings = settings
        print(f"MockAI initialized with settings: {settings[:100]}...")
    
    @staticmethod
    def generate_options(state: GameState) -> list[GameOption]:
        attrs = state.attributes
        options = []

        # Logic ported from mockAI.js
        if attrs.cash < 500:
            options.append(GameOption(
                id='fundraise',
                label="紧急融资",
                description="出让股份以换取急需的现金。",
                effects={"cash": 500, "reputation": -10, "morale": -5},
                resultNarrative="投资者同意了注资，但他们对公司的控制权提出了要求。"
            ))
        else:
            options.append(GameOption(
                id='marketing',
                label="全面营销",
                description="由于资金充足，发动一场大规模的市场战役。",
                effects={"cash": -300, "reputation": 15},
                resultNarrative="广告铺天盖地，品牌知名度显著提升。"
            ))

        if attrs.morale < 40:
            options.append(GameOption(
                id='teambuilding',
                label="团建活动",
                description="士气低落，组织一次外出团建。",
                effects={"cash": -100, "morale": 20},
                resultNarrative="团队在活动中重拾了凝聚力，工作氛围有所好转。"
            ))
        else:
            options.append(GameOption(
                id='overtime',
                label="赶工研发",
                description="趁着士气高昂，要求团队加班推进新产品。",
                effects={"morale": -10, "innovation": 15},
                resultNarrative="新功能提前上线，但员工们显得有些疲惫。"
            ))

        # Always valid option
        options.append(GameOption(
            id='consult',
            label="咨询顾问",
            description="聘请外部专家评估现状。",
            effects={"cash": -50, "innovation": 5},
            resultNarrative="顾问提供了一些新颖的见解，虽然昂贵但值得。"
        ))

        return options[:3]

    @staticmethod
    def analyze_input(text: str, state: GameState) -> dict:
        lower_input = text.lower()
        effects = {"cash": 0, "morale": 0, "reputation": 0, "innovation": 0}
        narrative = "系统记录了你的决策，正在评估市场反馈..."

        if "invest" in lower_input or "投资" in lower_input:
            effects["cash"] = -200
            effects["innovation"] = 10
            narrative = "你将资金投入到新项目中，研发部门对此感到兴奋。"
        elif "fire" in lower_input or "裁员" in lower_input:
            effects["cash"] = 100
            effects["morale"] = -20
            effects["reputation"] = -10
            narrative = "裁员决定引起了恐慌，办公室里弥漫着不安的气氛。"
        elif "party" in lower_input or "庆祝" in lower_input:
            effects["cash"] = -100
            effects["morale"] = 15
            narrative = "庆祝活动很成功，大家都很开心。"
        else:
            effects["cash"] = -10
            narrative = "你的决策已被执行，市场反应平平。"

        return {
            "effects": effects,
            "resultNarrative": narrative
        }
