// Services for analysis - calls Modal directly (no intermediate backend)

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
  private baseUrl: string = '';

  async checkServer(serverUrl: string): Promise<boolean> {
    this.baseUrl = serverUrl.replace(/\/$/, '');
    try {
      const res = await fetch(`${this.baseUrl}/salud`);
      const data = await res.json();
      return data.ok === true;
    } catch (e) {
      console.error('Server check failed:', e);
      return false;
    }
  }

  async startAnalysis(config: AnalysisConfig): Promise<string> {
    this.baseUrl = config.serverUrl.replace(/\/$/, '');

    // Paso 1: descargar el vídeo en Modal
    const dlRes = await fetch(`${this.baseUrl}/descargar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: config.videoUrl })
    });
    if (!dlRes.ok) {
      throw new Error(`Descarga fallida: ${dlRes.statusText}`);
    }
    const { video_id } = await dlRes.json();

    // Paso 2: lanzar el análisis (YOLO tracking)
    const anRes = await fetch(`${this.baseUrl}/analizar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_id,
        params: {
          modo: config.videoType,
          local_color: config.calibration?.localColor || 'blue',
          rival_color: config.calibration?.rivalColor || 'red'
        }
      })
    });
    if (!anRes.ok) {
      throw new Error(`Análisis fallido: ${anRes.statusText}`);
    }
    const { job_id } = await anRes.json();
    return job_id;
  }

  async getAnalysisStatus(jobId: string): Promise<AnalysisJob> {
    const res = await fetch(`${this.baseUrl}/estado/${jobId}`);
    if (!res.ok) {
      throw new Error(`Status check failed: ${res.statusText}`);
    }
    const data = await res.json();

    const job: AnalysisJob = {
      jobId,
      status: data.estado === 'completed' ? 'completed' : (data.estado === 'error' ? 'error' : 'processing'),
      progress: data.progreso
    };

    if (job.status === 'completed') {
      const resultRes = await fetch(`${this.baseUrl}/resultado/${jobId}`);
      if (resultRes.ok) {
        job.result = await resultRes.json();
      }
    }

    return job;
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
}

export default new AnalysisService();
