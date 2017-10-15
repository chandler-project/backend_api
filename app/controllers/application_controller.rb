class ApplicationController < ActionController::Base
  protect_from_forgery with: :exception

  def execute
    begin
      render_response(create_operation.execute)
    rescue BaseError => error
      render_response(error)
    end
  end

  private

  def create_operation
    find_operation.new(params, request, @resource)
  end

  def find_operation
    "#{find_module}::#{find_version}::#{find_action}".constantize
  end

  def find_version
    request.headers[:accept]
      .split('version=')
      .last
      .upcase
  end

  def find_module
    controller_name.camelize
  end

  def find_action
    action_name.camelize
  end

  def render_response(data)
    respond_to do |format|
      format.json { render json: data.to_json, status: data.status }
    end
  end
end
