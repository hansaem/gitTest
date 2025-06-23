using NUnit.Framework;
using Grpc.Net.Client;
using GrpcGreeter; // Generated from greet.proto
using System.Threading.Tasks;
using Grpc.Core;
using System.Net.Http; // Required for HttpClient

namespace GrpcConsoleClientTest
{
    [TestFixture]
    public class GreeterServiceTests
    {
        private GrpcChannel _channel;
        private Greeter.GreeterClient _client;
        private MockHttpMessageHandler _mockHttpMessageHandler;

        [SetUp]
        public void Setup()
        {
            // Setup a mock HttpMessageHandler to intercept gRPC calls
            var mockGreeterService = new MockGreeterService();
            _mockHttpMessageHandler = new MockHttpMessageHandler(mockGreeterService);

            // Create an HttpClient using the mock handler
            var httpClient = new HttpClient(_mockHttpMessageHandler)
            {
                // The BaseAddress must be set and must be an absolute URI.
                BaseAddress = new System.Uri("http://localhost")
            };

            // Configure the GrpcChannel to use this HttpClient
            var channelOptions = new GrpcChannelOptions { HttpClient = httpClient };
            _channel = GrpcChannel.ForAddress("http://localhost", channelOptions); // Address can be anything when HttpClient is provided

            _client = new Greeter.GreeterClient(_channel);
        }

        [TearDown]
        public void Teardown()
        {
            _channel?.Dispose();
            _mockHttpMessageHandler?.Dispose();
        }

        [Test]
        public async Task SayHello_ValidName_ReturnsGreeting()
        {
            // Arrange
            var request = new HelloRequest { Name = "NUnit" };

            // Act
            var reply = await _client.SayHelloAsync(request);

            // Assert
            Assert.IsNotNull(reply);
            Assert.AreEqual("Hello NUnit", reply.Message);
        }

        [Test]
        public void SayHello_EmptyName_ThrowsRpcException()
        {
            // Arrange
            var request = new HelloRequest { Name = "" };

            // Act & Assert
            var ex = Assert.ThrowsAsync<RpcException>(async () => await _client.SayHelloAsync(request));
            Assert.IsNotNull(ex);
            Assert.AreEqual(StatusCode.InvalidArgument, ex.StatusCode);
            Assert.AreEqual("Name cannot be empty", ex.Status.Detail);
        }

        [Test]
        public async Task SayHello_NullName_ThrowsRpcException()
        {
            // Arrange
            var request = new HelloRequest { Name = null }; // Protobuf typically treats null string as empty

            // Act & Assert
            // In protobuf, a null string is often treated the same as an empty string.
            // The MockGreeterService throws InvalidArgument for empty string.
            var ex = Assert.ThrowsAsync<RpcException>(async () => await _client.SayHelloAsync(request));
            Assert.IsNotNull(ex);
            Assert.AreEqual(StatusCode.InvalidArgument, ex.StatusCode);
            Assert.AreEqual("Name cannot be empty", ex.Status.Detail); // Assuming null is handled as empty by the service
        }
    }
}
