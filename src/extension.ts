// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as https from 'https';

async function togglApiRequest<T = any>(endpoint: string, method: string = 'GET', body?: any, apiToken?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${apiToken}:api_token`).toString('base64');
    const options: https.RequestOptions = {
      hostname: 'api.track.toggl.com',
      path: `/api/v9${endpoint}`,
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data as any);
          }
        } else {
          reject(new Error(`Toggl API error: ${res.statusCode} ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

class TogglPanel {
  public static currentPanel: TogglPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _apiToken: string;

  static show(context: vscode.ExtensionContext, apiToken: string) {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
    if (TogglPanel.currentPanel) {
      TogglPanel.currentPanel._panel.reveal(column);
      TogglPanel.currentPanel._update();
    } else {
      TogglPanel.currentPanel = new TogglPanel(context, apiToken, column || vscode.ViewColumn.One);
    }
  }

  private constructor(context: vscode.ExtensionContext, apiToken: string, column: vscode.ViewColumn) {
    this._apiToken = apiToken;
    this._panel = vscode.window.createWebviewPanel(
      'togglPanel',
      'Toggl Timers',
      column,
      { enableScripts: true }
    );
    this._update();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.command === 'startTimer') {
        await this._startTimer(msg.description);
        this._update();
      }
    }, null, this._disposables);
  }

  public dispose() {
    TogglPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
  }

  private async _update() {
    let currentTimer = null;
    let recentTimers: any[] = [];
    try {
      const timeEntries = await togglApiRequest('/me/time_entries', 'GET', undefined, this._apiToken);
      recentTimers = Array.isArray(timeEntries) ? timeEntries.slice(0, 5) : [];
      currentTimer = recentTimers.find((t: any) => t.duration < 0) || null;
    } catch (e) {
      // ignore
    }
    this._panel.webview.html = this._getHtml(currentTimer, recentTimers);
  }

  private _getHtml(currentTimer: any, recentTimers: any[]): string {
    return `
      <html><body>
        <h2>Current Timer</h2>
        <div>
          ${currentTimer ? `<b>${currentTimer.description || '(No Description)'}</b><br>Started: ${new Date(currentTimer.start).toLocaleString()}` : 'No timer running.'}
        </div>
        <h2>Recent Timers</h2>
        <ul>
          ${recentTimers.map(t => `<li>${t.description || '(No Description)'}<br>${new Date(t.start).toLocaleString()} - ${t.duration < 0 ? 'Running' : 'Stopped'}</li>`).join('')}
        </ul>
        <h2>Start New Timer</h2>
        <input id="desc" type="text" placeholder="Description" />
        <button onclick="startTimer()">Start</button>
        <script>
          function startTimer() {
            const desc = document.getElementById('desc').value;
            window.acquireVsCodeApi().postMessage({ command: 'startTimer', description: desc });
          }
        </script>
      </body></html>
    `;
  }

  private async _startTimer(description: string) {
    await togglApiRequest('/me/time_entries', 'POST', { description }, this._apiToken);
  }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vstoggl" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('vstoggl.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from VSToggl!');
	});

	context.subscriptions.push(disposable);

	const togglCommand = vscode.commands.registerCommand('vstoggl.fetchTogglMe', async () => {
		const apiToken = await vscode.window.showInputBox({
			prompt: 'Enter your Toggl API token',
			ignoreFocusOut: true,
			password: true,
		});
		if (!apiToken) {
			return;
		}
		try {
			const me = await togglApiRequest('/me', 'GET', undefined, apiToken);
			vscode.window.showInformationMessage(`Toggl user: ${me.fullname || JSON.stringify(me)}`);
		} catch (err: any) {
			vscode.window.showErrorMessage(`Toggl API error: ${err.message}`);
		}
	});
	context.subscriptions.push(togglCommand);

	const togglPanelCommand = vscode.commands.registerCommand('vstoggl.showPanel', async () => {
		const apiToken = await vscode.window.showInputBox({
			prompt: 'Enter your Toggl API token',
			ignoreFocusOut: true,
			password: true,
		});
		if (!apiToken) {
			return;
		}
		TogglPanel.show(context, apiToken);
	});
	context.subscriptions.push(togglPanelCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}
