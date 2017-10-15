class ApiConstraint
  def initialize(options)
    @version = options[:version]
  end

  def matches?(request)
    request.headers[:accept].include?("version=#{@version}")
  end
end
