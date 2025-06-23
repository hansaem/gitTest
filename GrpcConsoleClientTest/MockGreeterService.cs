using Grpc.Core;
using GrpcGreeter; // Generated from greet.proto

namespace GrpcConsoleClientTest
{
    public class MockGreeterService : Greeter.GreeterBase
    {
        public override Task<HelloReply> SayHello(HelloRequest request, ServerCallContext context)
        {
            if (string.IsNullOrEmpty(request.Name))
            {
                throw new RpcException(new Status(StatusCode.InvalidArgument, "Name cannot be empty"));
            }
            return Task.FromResult(new HelloReply { Message = "Hello " + request.Name });
        }
    }
}
