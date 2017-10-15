class Operation
  attr_reader :params
  attr_accessor :current_user

  def initialize(params, current_user = nil)
    @params = params
    @current_user = current_user
  end

  def execute
    process
  end

  private

  def process
    raise NotImplementedError
  end
end
