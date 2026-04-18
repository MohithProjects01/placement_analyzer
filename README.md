# Placement Analyzer 🎓

[![Live Demo](https://img.shields.io/badge/Live-Demo-brightgreen?style=for-the-badge)](https://placement-analyzer.netlify.app/)

Placement Analyzer is an AI-powered intelligence engine designed to help students master their career preparation. By transforming static PDFs, placement papers, and company notes into interactive, data-driven roadmaps, it gives you the competitive edge needed for modern technical rounds.

**Visit the Live App:** [https://placement-analyzer.netlify.app/](https://placement-analyzer.netlify.app/)

## 🚀 Key Features

- **🧠 Intelligent PDF Analysis**: Upload placement papers or notes, and our AI engine clusters questions, identifies core topics, and maps company trends.
- **📊 Insights Dashboard**: Visualize topic distribution and difficulty spread with interactive charts.
- **📈 Pattern Clustering**: Discover recurring question types and high-probability topics based on actual company patterns.
- **📝 Automated Study Notes**: Generate strategic summaries and roadmap notes automatically from your materials.
- **⚡ Blitz Practice Arena**: Generate AI-powered mock tests (MCQs and Coding) tailored to the specific content you uploaded.
- **🔗 Smart Resource Mapping**: Automatically finds external solutions and relevant study links for identified patterns.
- **💬 Real-time AI Assistant**: Chat with your documents to clarify concepts or ask for specific career guidance.

## 🛠️ Technology Stack

- **Frontend**: React 18+, TypeScript, Tailwind CSS, Framer Motion (Animations).
- **Backend**: Node.js (Express), Vite.
- **AI Engine**: Google Gemini Pro (via @google/genai).
- **Visualization**: Recharts, D3.
- **Parsing**: Pdf-parse, Multer.

## 📦 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- A Gemini API Key

### Local Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/placement-analyzer.git
   cd placement-analyzer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   Create a `.env` file in the root directory:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

The application will be running at `http://localhost:3000`.

## 📱 Mobile-First Design

The application is fully optimized for mobile browsers, featuring a dynamic small viewport height (SVH) fix, responsive charts, and an expandable mobile search interface.

## 📄 License

MIT License - feel free to use this for your own career preparation or projects!
