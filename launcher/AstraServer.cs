using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

// Minimal local-only static server. It never accepts a LAN connection or uploads files.
public sealed class AstraServer : IDisposable {
    private TcpListener listener;
    private Thread acceptThread;
    private volatile bool running;
    private string root;
    private int port;
    private readonly SemaphoreSlim slots = new SemaphoreSlim(16, 16);
    public int Start(string directory, int requestedPort) {
        root = Path.GetFullPath(directory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!File.Exists(Path.Combine(root, "index.html"))) throw new FileNotFoundException("Please extract the entire ZIP before opening Start.");
        listener = new TcpListener(IPAddress.Loopback, requestedPort);
        listener.Start(32); port = ((IPEndPoint)listener.LocalEndpoint).Port; running = true;
        acceptThread = new Thread(Accept); acceptThread.IsBackground = true; acceptThread.Start();
        return port;
    }
    private void Accept() {
        while (running) {
            try {
                TcpClient client = listener.AcceptTcpClient();
                if (!slots.Wait(0)) { client.Close(); continue; }
                ThreadPool.QueueUserWorkItem(delegate(object _) {
                    try { Serve(client); } catch { } finally { client.Close(); slots.Release(); }
                });
            } catch (SocketException) { if (!running) break; }
              catch (ObjectDisposedException) { break; }
        }
    }
    private void Serve(TcpClient client) {
        client.ReceiveTimeout = 5000; client.SendTimeout = 30000;
        using (NetworkStream stream = client.GetStream()) {
            MemoryStream header = new MemoryStream(); int end = 0;
            while (header.Length < 16384) {
                int b = stream.ReadByte(); if (b < 0) return; header.WriteByte((byte)b);
                end = ((end << 8) | b);
                if (end == 0x0d0a0d0a) break;
            }
            if (end != 0x0d0a0d0a) { Error(stream, "431 Request Header Fields Too Large", false); return; }
            string[] lines = Encoding.ASCII.GetString(header.ToArray()).Split(new string[]{"\r\n"}, StringSplitOptions.None);
            string[] request = lines[0].Split(' '); if (request.Length != 3) { Error(stream,"400 Bad Request", false); return; }
            bool head = request[0] == "HEAD";
            if (request[0] != "GET" && !head) { Error(stream,"405 Method Not Allowed", false); return; }
            string host = "";
            foreach (string line in lines) if (line.StartsWith("Host:",StringComparison.OrdinalIgnoreCase)) host = line.Substring(5).Trim();
            if (host != "127.0.0.1:" + port && host != "localhost:" + port) { Error(stream,"403 Forbidden",head); return; }
            string raw = request[1].Split('?')[0];
            if (!raw.StartsWith("/")) { Error(stream,"400 Bad Request",head); return; }
            string path;
            try {
                string relative = Uri.UnescapeDataString(raw).TrimStart('/').Replace('/',Path.DirectorySeparatorChar);
                if (relative.Length == 0) relative = "index.html";
                path = Path.GetFullPath(Path.Combine(root,relative));
                if (!path.StartsWith(root,StringComparison.OrdinalIgnoreCase)) { Error(stream,"403 Forbidden",head); return; }
            } catch { Error(stream,"400 Bad Request",head); return; }
            if (!File.Exists(path)) { Error(stream,"404 Not Found",head); return; }
            using (FileStream file = File.OpenRead(path)) {
                Header(stream,"200 OK",Mime(Path.GetExtension(path)),file.Length);
                if (!head) file.CopyTo(stream,65536);
            }
        }
    }
    private static string Mime(string extension) {
        switch(extension.ToLowerInvariant()) {
            case ".html": return "text/html; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".js": case ".mjs": return "text/javascript; charset=utf-8";
            case ".wasm": return "application/wasm";
            case ".json": return "application/json; charset=utf-8";
            case ".svg": return "image/svg+xml";
            case ".png": return "image/png";
            case ".jpg": case ".jpeg": return "image/jpeg";
            case ".txt": return "text/plain; charset=utf-8";
            default: return "application/octet-stream";
        }
    }
    private static void Header(Stream stream,string status,string type,long length) {
        string text = "HTTP/1.1 " + status + "\r\nContent-Type: " + type + "\r\nContent-Length: " + length +
            "\r\nConnection: close\r\nCache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\nCross-Origin-Resource-Policy: same-origin\r\n\r\n";
        byte[] data = Encoding.ASCII.GetBytes(text); stream.Write(data,0,data.Length);
    }
    private static void Error(Stream stream,string status,bool head) {
        byte[] data = Encoding.UTF8.GetBytes(status); Header(stream,status,"text/plain; charset=utf-8",data.Length);
        if (!head) stream.Write(data,0,data.Length);
    }
    public void Dispose() { running = false; if(listener != null)listener.Stop(); }
}
