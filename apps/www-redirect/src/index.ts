export default {
  fetch(request: Request) {
    const destination = new URL(request.url);
    destination.protocol = "https:";
    destination.hostname = "jarins.com";
    destination.port = "";
    return Response.redirect(destination, 308);
  },
};
