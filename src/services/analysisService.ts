// Services for analysis with Vast.ai

export interface AnalysisJob {
  jobId: string;
  status: 'started' | 'downloading' | 'analyzing' | 'processing' | 'completed' | 'error';
  progress?: number;
  result?: any;
  error?: string;
}

export interface AnalysisConfig {
  serverUrl: string;
  videoUrl: string;
  videoType: 'fijo' | 'clips';
  calibration?: {
    points?: Array<{ x: number; y: number }>;
    localColor?: string;
    rivalColor?: string;
  };
}

class AnalysisService {
  async checkServer(serverUrl: string): Promise<boolean> {
    try {
      const res = await fetch('/api/check-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverUrl })
      });
      const data = await res.json();
      return data.connected;
    } catch (e) {
      console.error('Server check failed:', e);
      return false;
    }
  }

  async startAnalysis(config: AnalysisConfig): Promise<string> {
    const res = await fetch('/api/analyze-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    
    if (!res.ok) {
      throw new Error(`Analysis failed: ${res.statusText}`);
    }
    
    const { jobId } = await res.json();
    return jobId;
  }

  async getAnalysisStatus(jobId: string): Promise<AnalysisJob> {
    const res = await fetch(`/api/analysis/${jobId}`);
    
    if (!res.ok) {
      throw new Error(`Status check failed: ${res.statusText}`);
    }
    
    return res.json();
  }

  async pollAnalysis(
    jobId: string,
    onProgress?: (job: AnalysisJob) => void,
    maxWaitMs: number = 3600000
  ): Promise<AnalysisJob> {
    const startTime = Date.now();
    const pollInterval = 3000;

    return new Promise((resolve, reject) => {
      const timer = setInterval(async () => {
        try {
          const job = await this.getAnalysisStatus(jobId);
          
          if (onProgress) {
            onProgress(job);
          }

          if (job.status === 'completed') {
            clearInterval(timer);
            resolve(job);
          } else if (job.status === 'error') {
            clearInterval(timer);
            reject(new Error(job.error || 'Analysis failed'));
          }

          if (Date.now() - startTime > maxWaitMs) {
            clearInterval(timer);
            reject(new Error('Analysis timeout'));
          }
        } catch (err) {
          clearInterval(timer);
          reject(err);
        }
      }, pollInterval);
    });
  }

  async getFrame(
    serverUrl: string,
    videoId: string,
    timestamp: number = 30
  ): Promise<string> {
    const res = await fetch('/api/get-frame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverUrl, videoId, timestamp })
    });

    if (!res.ok) {
      throw new Error(`Frame fetch failed: ${res.statusText}`);
    }

    const { frame } = await res.json();
    return frame;
  }
}

export default new AnalysisService();
