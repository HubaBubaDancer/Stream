import VideoPlayer from "./components/VideoPlayer";
import Chat from "./components/Chat";

function App() {
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="h-screen flex flex-col lg:flex-row">
        {/* Video Panel - 70% on desktop */}
        <div className="flex-1 lg:w-[70%] p-2 lg:p-4">
          <div className="h-full bg-[#1a1a1a] rounded-lg overflow-hidden">
            <VideoPlayer />
          </div>
        </div>

        {/* Chat Panel - 30% on desktop */}
        <div className="h-[40vh] lg:h-auto lg:w-[30%] p-2 lg:p-4 lg:pl-0">
          <div className="h-full bg-[#1a1a1a] rounded-lg overflow-hidden">
            <Chat />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
