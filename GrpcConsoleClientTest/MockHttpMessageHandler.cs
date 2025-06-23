using Grpc.Core;
using GrpcGreeter; // Generated from greet.proto
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace GrpcConsoleClientTest
{
    public class MockHttpMessageHandler : HttpMessageHandler
    {
        private readonly Greeter.GreeterBase _serviceImpl;

        public MockHttpMessageHandler(Greeter.GreeterBase serviceImpl)
        {
            _serviceImpl = serviceImpl;
        }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var requestStream = await request.Content.ReadAsStreamAsync(cancellationToken);

            // For unary calls, the request is a single message.
            // We need to deserialize it. This part can be tricky without the full server infrastructure.
            // Typically, you'd use Grpc.AspNetCore.Server.ClientFactory for in-memory testing.
            // For simplicity here, we'll assume a specific way to invoke the service method
            // or make this handler more generic if we knew the exact byte format.

            // This is a simplified way to handle the request for this specific test.
            // A real in-memory test server (e.g., using TestServer) would handle this more robustly.
            if (request.RequestUri.PathAndQuery.EndsWith("/greet.Greeter/SayHello"))
            {
                try
                {
                    // Manually deserialize (simplified)
                    // In a real scenario, you'd need proper gRPC message parsing here.
                    // This is a placeholder for where the request would be deserialized
                    // and the service method invoked.
                    // For this example, we'll directly invoke based on a known pattern
                    // rather than full deserialization which is complex here.

                    // Let's assume the client will serialize the request, and we need to invoke the service.
                    // This is non-trivial to do correctly without more infrastructure.
                    // We will make a big simplification for this example.
                    var helloRequest = await ReadRequestAsync<HelloRequest>(requestStream);

                    var serverCallContext = new MockServerCallContext();
                    var response = await _serviceImpl.SayHello(helloRequest, serverCallContext);

                    var responseStream = new MemoryStream();
                    // Manually serialize (simplified)
                    // This is also a placeholder.
                    await WriteResponseAsync(responseStream, response);
                    responseStream.Position = 0;

                    return new HttpResponseMessage(HttpStatusCode.OK)
                    {
                        Content = new StreamContent(responseStream),
                        Version = new Version(2, 0) // HTTP/2
                    };
                }
                catch (RpcException ex)
                {
                    // This is a simplified way to return gRPC errors over HTTP
                    var responseMessage = new HttpResponseMessage(HttpStatusCode.OK); // gRPC errors are still 200 OK at HTTP level
                    responseMessage.Headers.Add("grpc-status", ((int)ex.StatusCode).ToString());
                    responseMessage.Headers.Add("grpc-message", ex.Status.Detail);
                    return responseMessage;
                }
                catch (Exception ex)
                {
                     var responseMessage = new HttpResponseMessage(HttpStatusCode.InternalServerError);
                     responseMessage.Content = new StringContent($"Error: {ex.Message}");
                     return responseMessage;
                }
            }

            return new HttpResponseMessage(HttpStatusCode.NotFound);
        }

        // Simplified request reading - assumes length-prefixed gRPC-Web style for simplicity
        private async Task<T> ReadRequestAsync<T>(Stream stream) where T : Google.Protobuf.IMessage<T>, new()
        {
            // This is a placeholder. Real gRPC deserialization is more complex.
            // It involves reading the length prefix, then the message.
            // For this example, we'll assume the client writes the message directly,
            // which is not how gRPC over HTTP/2 works but simplifies the mock.
            // A better mock would use the generated marshallers.
            using var memoryStream = new MemoryStream();
            await stream.CopyToAsync(memoryStream);
            memoryStream.Position = 0;

            // Skip 5 byte gRPC header (1 byte for compression, 4 for length)
            // This is a common pattern but can vary.
            if (memoryStream.Length > 5)
            {
                memoryStream.Seek(5, SeekOrigin.Begin);
            }
            return Google.Protobuf.MessageParser<T>.Create(() => new T()).ParseFrom(memoryStream);
        }

        // Simplified response writing
        private async Task WriteResponseAsync<T>(Stream stream, T response) where T : Google.Protobuf.IMessage
        {
            // This is a placeholder. Real gRPC serialization is more complex.
            // It involves writing a 5-byte header (1 byte for compression, 4 for length)
            // then the message.
            byte[] messageBytes = response.ToByteArray();
            byte[] header = new byte[5];
            header[0] = 0; // No compression
            BitConverter.GetBytes(messageBytes.Length).CopyTo(header, 1);
            if (BitConverter.IsLittleEndian) Array.Reverse(header, 1, 4); // Ensure Big Endian for network order

            await stream.WriteAsync(header, 0, header.Length);
            await stream.WriteAsync(messageBytes, 0, messageBytes.Length);
        }


        // Mock ServerCallContext
        private class MockServerCallContext : ServerCallContext
        {
            protected override Task WriteResponseHeadersAsyncCore(Metadata responseHeaders) => Task.CompletedTask;
            protected override ContextPropagationToken CreatePropagationTokenCore(ContextPropagationOptions options) => null;
            protected override string MethodCore => "SayHello";
            protected override string HostCore => "localhost";
            protected override string PeerCore => "ipv4:127.0.0.1:0"; // Example
            protected override DateTime DeadlineCore => DateTime.UtcNow.AddHours(1); // Example
            protected override Metadata RequestHeadersCore => new Metadata();
            protected override CancellationToken CancellationTokenCore => CancellationToken.None;
            protected override Metadata ResponseTrailersCore => new Metadata();
            protected override Status StatusCore { get; set; }
            protected override WriteOptions WriteOptionsCore { get; set; }
            protected override AuthContext AuthContextCore => null; // Example, if needed
        }
    }
}
