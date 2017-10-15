class EmailInUse < BaseError
  attr_reader :user

  def initialize(user)
    @user = user
  end

  def code
    'EMAIL_IN_USE'
  end

  def data
    user
  end

  def status
    422
  end
end
