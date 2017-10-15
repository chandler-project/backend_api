module Helpers
  module Authen
    def set_version(version = 'v1')
      @request.headers.merge!(accept: "application/json version=#{version}")
    end
  end
end
