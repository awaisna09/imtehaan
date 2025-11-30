# 🤖 AI Agents Directory

This directory contains all AI agents used in the Imtehaan AI EdTech Platform. These agents are responsible for intelligent grading, feedback generation, and educational interactions.

---

## 📂 Directory Structure

```
agents/
├── __init__.py                      # Package initialization
├── README.md                        # This documentation
├── ai_tutor_agent.py               # 🤖 AI Tutor for conversations
├── answer_grading_agent.py         # 📝 Individual answer grading
└── mock_exam_grading_agent.py      # 📊 Complete exam grading
```

---

## 📁 Agent Files

### **1. AI Tutor Agent** (`ai_tutor_agent.py`) 🤖
**Purpose**: Interactive educational conversations and lesson generation

**Features**:
- ✅ Context-aware conversations
- ✅ LangChain + GPT-4 integration
- ✅ Lesson generation
- ✅ Conversation memory
- ✅ Adaptive difficulty levels
- ✅ Educational responses with examples

**Usage**:
```python
# Method 1: Direct import from agents folder
from agents.ai_tutor_agent import AITutorAgent, TutorRequest

# Method 2: Import from agents package
from agents import AITutorAgent, TutorRequest

agent = AITutorAgent(api_key)
request = TutorRequest(
    message="What is market segmentation?",
    topic="Marketing",
    user_id="user123"
)
response = agent.get_response(request)

print(f"Response: {response.response}")
print(f"Suggestions: {response.suggestions}")
```

**Output Structure**:
```python
TutorResponse:
    response: str                    # AI-generated response
    suggestions: List[str]           # Suggested follow-up questions
    related_concepts: List[str]      # Related topics
    confidence_score: float          # Response confidence (0-1)
```

---

### **2. Answer Grading Agent** (`answer_grading_agent.py`)
**Purpose**: Grade individual student answers in Practice Mode

**Features**:
- ✅ 5-dimensional analysis (Content Accuracy, Structure, Examples, Critical Thinking, Business Terminology)
- ✅ LangChain + GPT-4 integration
- ✅ Detailed feedback generation
- ✅ Percentage and letter grading (A-F)
- ✅ Actionable improvement suggestions
- ✅ Fair and consistent evaluation

**Usage**:
```python
# Method 1: Direct import from agents folder
from agents.answer_grading_agent import AnswerGradingAgent, GradingResult

# Method 2: Import from agents package
from agents import AnswerGradingAgent, GradingResult

agent = AnswerGradingAgent(api_key)
result = agent.grade_answer(
    question="What is market segmentation?",
    model_answer="Market segmentation is...",
    student_answer="Students answer here..."
)

print(f"Score: {result.overall_score}/50")
print(f"Grade: {result.grade}")
print(f"Feedback: {result.specific_feedback}")
```

**Output Structure**:
```python
GradingResult:
    overall_score: float       # 0-50
    percentage: float          # 0-100
    grade: str                 # A, B, C, D, F
    strengths: List[str]
    areas_for_improvement: List[str]
    specific_feedback: str
    suggestions: List[str]
```

---

### **3. Mock Exam Grading Agent** (`mock_exam_grading_agent.py`)
**Purpose**: Grade complete mock exams (P1 and P2)

**Features**:
- ✅ Batch grading of multiple questions
- ✅ Comprehensive exam reports
- ✅ Overall performance analysis
- ✅ Pattern recognition across questions
- ✅ Personalized recommendations
- ✅ Strengths and weaknesses summary

**Usage**:
```python
# Method 1: Direct import from agents folder
from agents.mock_exam_grading_agent import MockExamGradingAgent, ExamReport

# Method 2: Import from agents package
from agents import MockExamGradingAgent, ExamReport

agent = MockExamGradingAgent(api_key)

attempted_questions = [
    {
        'question_id': 1,
        'question': 'Question text',
        'user_answer': 'Student answer',
        'solution': 'Model answer',
        'marks': 10,
        'part': 'A'
    },
    # ... more questions
]

report = agent.grade_exam(attempted_questions)

print(f"Score: {report.marks_obtained}/{report.total_marks}")
print(f"Grade: {report.overall_grade}")
print(f"Percentage: {report.percentage_score}%")
```

**Output Structure**:
```python
ExamReport:
    total_questions: int
    questions_attempted: int
    total_marks: int
    marks_obtained: float
    percentage_score: float
    overall_grade: str           # A+, A, B+, B, C+, C, D, F
    question_grades: List[QuestionGrade]
    overall_feedback: str
    recommendations: List[str]
    strengths_summary: List[str]
    weaknesses_summary: List[str]
```

---

## 🔧 Configuration

### **Environment Variables** (`config.env`)
```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# LangSmith Configuration (Optional)
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your_langsmith_key
LANGSMITH_PROJECT=imtehaan-ai-tutor

# Agent Configuration
GRADING_MODEL=gpt-4
GRADING_TEMPERATURE=0.1
GRADING_MAX_TOKENS=4000
```

---

## 🚀 How It Works

### **Architecture Flow**

```
1. User submits answer/exam
        ↓
2. Frontend sends request to Backend API
        ↓
3. Backend calls appropriate Agent
        ↓
4. Agent uses LangChain + GPT-4
        ↓
5. LLM analyzes and grades
        ↓
6. Agent structures response
        ↓
7. Backend returns JSON
        ↓
8. Frontend displays results
```

---

## 📊 Grading Criteria

### **Answer Grading Agent** (50 points total)
- **Content Accuracy** (10 pts): Business concept understanding
- **Structure Clarity** (10 pts): Logical organization
- **Examples Relevance** (10 pts): Quality and appropriateness
- **Critical Thinking** (10 pts): Depth of analysis
- **Business Terminology** (10 pts): Proper use of terminology

### **Mock Exam Grading Agent**
- Individual question grading
- Weighted by marks allocated
- Overall performance analysis
- Pattern recognition across topics

---

## 🎯 Grade Scales

### **Practice Mode** (A-F Scale)
- **A**: 90-100% - Excellent
- **B**: 80-89% - Good
- **C**: 70-79% - Satisfactory
- **D**: 60-69% - Basic
- **F**: 0-59% - Needs Improvement

### **Mock Exams** (A+-F Scale)
- **A+**: 97-100%
- **A**: 93-96%
- **B+**: 87-92%
- **B**: 83-86%
- **C+**: 77-82%
- **C**: 73-76%
- **D**: 65-72%
- **F**: 0-64%

---

## 🔗 Integration

### **With Unified Backend**
```python
# unified_backend.py
from agents import AITutorAgent, AnswerGradingAgent, MockExamGradingAgent

# Initialize all agents
ai_tutor_agent = AITutorAgent(api_key)
grading_agent = AnswerGradingAgent(api_key)
mock_exam_agent = MockExamGradingAgent(api_key)

# AI Tutor endpoints
@app.post("/tutor/chat")
async def chat_with_tutor(request: TutorRequest):
    response = ai_tutor_agent.get_response(request)
    return response

@app.post("/grade-answer")
async def grade_answer(request: GradingRequest):
    result = grading_agent.grade_answer(
        request.question,
        request.model_answer,
        request.student_answer
    )
    return result

@app.post("/grade-mock-exam")
async def grade_mock_exam(request: MockExamGradingRequest):
    report = mock_exam_agent.grade_exam(
        request.attempted_questions
    )
    return report
```

---

## 🧪 Testing

### **Test AI Tutor Agent**
```bash
python agents/ai_tutor_agent.py
```

### **Test Answer Grading**
```bash
python agents/answer_grading_agent.py
```

### **Test Mock Exam Grading**
```bash
python agents/mock_exam_grading_agent.py
```

---

## 📝 Key Features

### **1. Intelligent Analysis**
- Deep understanding of Business Studies concepts
- Context-aware evaluation
- Fair and consistent scoring

### **2. Comprehensive Feedback**
- Detailed specific feedback
- Actionable suggestions
- Strength identification
- Improvement areas

### **3. Pattern Recognition**
- Identifies common strengths across questions
- Detects recurring weaknesses
- Provides targeted recommendations

### **4. Error Handling**
- Graceful fallback on errors
- Detailed logging
- User-friendly error messages

---

## 🔒 Security & Best Practices

- ✅ API keys stored in environment variables
- ✅ Input validation and sanitization
- ✅ Structured Pydantic models for responses
- ✅ Comprehensive logging
- ✅ Error handling and fallbacks

---

## 📈 Future Enhancements

- [ ] Multi-subject support
- [ ] Adaptive difficulty
- [ ] Learning pattern analysis
- [ ] Peer comparison
- [ ] Advanced analytics

---

## 🆘 Support

For issues or questions about the agents:
1. Check logs for error details
2. Verify API key configuration
3. Test with example data
4. Review troubleshooting guides

---

**These agents power the intelligent grading and feedback system in the Imtehaan platform!** 🎉

